// enum for UART‑baud
const enum UartBaud {
    //% block="1,2 K"
    BaudRate1200 = "0",
    //% block="2,4 K"
    BaudRate2400 = "1",
    //% block="4,8 K"
    BaudRate4800 = "2",
    //% block="9,6 K"
    BaudRate9600 = "3",
    //% block="19,2 K"
    BaudRate19200 = "4",
    //% block="38,4 K"
    BaudRate38400 = "5",
    //% block="57,6 K"
    BaudRate57600 = "6",
    //% block="115,2 K"
    BaudRate115200 = "7"
}

// enum for luft (air) baud
const enum AirBaud {
    //% block="0,3 K"
    BaudRate300 = "0",
    //% block="1,2 K"
    BaudRate1200 = "1",
    //% block="2,4 K"
    BaudRate2400 = "2",
    //% block="4,8 K"
    BaudRate4800 = "3",
    //% block="9,6 K"
    BaudRate9600 = "4",
    //% block="19,2 K"
    BaudRate19200 = "5"
}

/**
 * E32LORA blokker
 */
//% weight=100 color=#00cc00 icon="\uf012" block="E32LORA"
namespace E32LORA {

    /**
     * Klasse for pinnene på E32-modulen
     */
    export class E32PinConfig {
        m0: DigitalPin;
        m1: DigitalPin;
        aux: DigitalPin;
        tx: SerialPin;
        rx: SerialPin;
        baud: BaudRate;
        config: boolean;
    }

    let e32Pins = new E32PinConfig();
    let initialized = false;

    function init() {
        if (initialized) return;
        initialized = true;
    }

    let onReceivedStringHandler: (mottatt: string) => void;

    serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
        if (!e32Pins.config) {
            let str: string = serial.readString()
            onReceivedStringHandler(str)
        }
    })

    // ==========================================================================
    // Interne funksjoner
    // ==========================================================================

    function e32auxTimeout(value: number) {
        basic.pause(value)
        if (auxPin() == 0) {
            basic.showIcon(IconNames.Angry)
            basic.showString("e: aux timeout")
        }
    }

    function decToHexString(int: number, base: number): string {
        let letters = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
        let returnVal = "";
        if (base > 1 && base < 37) {
            while (int != 0) {
                let rest = int % base;
                int = Math.floor(int / base);
                returnVal = letters[rest] + returnVal;
            }
        }
        if (returnVal == "") returnVal = "0"
        if (returnVal.length == 1) returnVal = "0" + returnVal
        return returnVal;
    }

    function decToBcd(value: number): number {
        return (Math.floor(value / 10) << 4) + (value % 10)
    }

    function bcdToDec(value: number): number {
        return Math.floor(value / 16) * 10 + (value % 16)
    }

    function errorHalt(errno: number) {
        while (true) {
            basic.showIcon(IconNames.Sad)
            basic.pause(2000)
            basic.showString("E32:" + convertToText(errno))
        }
    }

    function buffer2string(buf: Buffer): string {
        let str = ""
        let recArray = buf.toArray(NumberFormat.UInt8LE)
        for (let idx = 0; idx <= recArray.length - 1; idx++) {
            str += decToHexString(recArray[idx], 16) + " "
        }
        return str
    }

    // ==========================================================================
    // Eksporterte funksjoner
    // ==========================================================================

    //% weight=44
    //% block="E32LORA pin config: | M0: %m0 M1: %m1 AUX: %aux | TX: %tx RX: %rx BAUD: %baud KONFIGURASJONSMODUS: %ConfigMode"
    //% m0.defl=DigitalPin.P16 m1.defl=DigitalPin.P12 aux.defl=DigitalPin.P1 tx.defl=SerialPin.P2 rx.defl=SerialPin.P8 baud.defl=BaudRate.BaudRate9600 ConfigMode.defl=false
    export function e32Init(m0: DigitalPin, m1: DigitalPin, aux: DigitalPin, tx: SerialPin, rx: SerialPin, baud: BaudRate, ConfigMode: boolean) {
        serial.redirect(rx, tx, baud)
        e32Pins.m0 = m0
        e32Pins.m1 = m1
        e32Pins.aux = aux
        e32Pins.tx = tx
        e32Pins.rx = rx
        e32Pins.baud = baud
        e32Pins.config = ConfigMode
        if (e32Pins.config) {
            setSetupMode()
        } else {
            setNormalMode()
        }
    }

    //% block="når E32LORA mottar tekst"
    //% blockGap=16
    export function onReceivedString(cb: (mottatt: string) => void) {
        init();
        onReceivedStringHandler = cb;
    }

    //% block="send tekst via E32LORA: %str"
    export function e32SendString(str: string) {
        if (!e32Pins.config) {
            setNormalMode()
            serial.writeLine(str)
        }
    }

    //% block="send tekst via E32LORA: %str TIL ADDRESSE: %addr KANAL: %channel"
    export function e32SendStringFixed(str: string, addr: number, channel: number) {
        let addrString = ""
        if (addr < 0 || addr > 65535) errorHalt(11)
        if (channel < 0 || channel > 31) errorHalt(12)

        if (addr <= 255) {
            addrString = "00" + decToHexString(addr, 16)
        } else {
            let lo: NumberFormat.UInt8LE = addr & 0xff
            let hi: NumberFormat.UInt8LE = (addr & 0xff00) >> 8
            addrString = decToHexString(hi, 16) + decToHexString(lo, 16)
        }

        let byte3String: string = decToHexString(channel & 0x1f, 16)
        let cmdBuffer = Buffer.fromHex(addrString + byte3String)

        if (!e32Pins.config) {
            setNormalMode()
            serial.writeBuffer(cmdBuffer)
            serial.writeLine(str)
        }
    }

    //% block="sett konfigurasjonsmodus"
    export function setSetupMode() {
        pins.digitalWritePin(e32Pins.m0, 1)
        pins.digitalWritePin(e32Pins.m1, 1)
        e32auxTimeout(100)
    }

    //% block="sett normalmodus"
    export function setNormalMode() {
        pins.digitalWritePin(e32Pins.m0, 0)
        pins.digitalWritePin(e32Pins.m1, 0)
        e32auxTimeout(100)
    }

    //% block="les AUX pin"
    export function auxPin() {
        return pins.digitalReadPin(e32Pins.aux)
    }

    //% block="les E32-versjon"
    export function e32version(): string {
        let rcvData: Buffer = null
        let params = ""
        setSetupMode()
        let dataToSend = Buffer.fromHex("c3c3c3")
        serial.writeBuffer(dataToSend)
        rcvData = serial.readBuffer(4)
        let recArray = rcvData.toArray(NumberFormat.UInt8LE)
        for (let idx = 0; idx <= recArray.length - 1; idx++) {
            params += decToHexString(recArray[idx], 16) + " "
        }
        setNormalMode()
        return params
    }

    //% block="les E32 parametere"
    export function e32parameters(): string {
        let rcvData: Buffer = Buffer.create(6)
        let params = ""
        setSetupMode()
        e32auxTimeout(200)
        let dataToSend = Buffer.fromHex("c1c1c1")
        serial.writeBuffer(dataToSend)
        rcvData = serial.readBuffer(6)
        let recArray = rcvData.toArray(NumberFormat.UInt8LE)
        for (let idx = 0; idx <= recArray.length - 1; idx++) {
            params += decToHexString(recArray[idx], 16) + " "
        }
        setNormalMode()
        e32auxTimeout(200)
        return params
    }

    //% block="tilbakestill E32"
    export function e32reset() {
        setSetupMode()
        let dataToSend = Buffer.fromHex("c4c4c4")
        serial.writeBuffer(dataToSend)
        setNormalMode()
        e32auxTimeout(100)
    }

    //% block="konfigurer E32LORA: | ADDRESSE: %addr KANAL: %channel FASTMODUS: %fixedm UART BAUD: %ubaud AIR BAUD: %airbaud POWER: %pwr LAGRE KONFIG: %save"
    export function e32config(addr: number, channel: number, fixedm: boolean, ubaud: UartBaud, airbaud: AirBaud, pwr: number, save: boolean) {
        if (!e32Pins.config) return
        // Parametere sjekk
        let addrString = ""
        if (addr < 0 || addr > 65535) errorHalt(11)
        if (channel < 0 || channel > 31) errorHalt(12)
        if (pwr < 0 || pwr > 3) errorHalt(13)

        if (addr <= 255) {
            addrString = "00" + decToHexString(addr, 16)
        } else {
            let lo: NumberFormat.UInt8LE = addr & 0xff
            let hi: NumberFormat.UInt8LE = (addr & 0xff00) >> 8
            addrString = decToHexString(hi, 16) + decToHexString(lo, 16)
        }

        let byte1: NumberFormat.UInt8LE = save ? 0xc0 : 0xc2
        let byte1String = decToHexString(byte1, 16)
        let _uartbaud: NumberFormat.UInt8LE = parseInt(ubaud)
        let _airbaud: NumberFormat.UInt8LE = parseInt(airbaud)
        let byte3: NumberFormat.UInt8LE = ((_uartbaud << 3) + _airbaud) & 0x3f
        let byte3String = decToHexString(byte3, 16)
        let byte4String = decToHexString(channel & 0x1f, 16)
        let byte5: NumberFormat.UInt8LE = fixedm ? 0xc4 + pwr : 0x44 + pwr
        let byte5String = decToHexString(byte5, 16)

        let cmdBuffer = Buffer.fromHex(byte1String + addrString + byte3String + byte4String + byte5String)
        setSetupMode()
        e32auxTimeout(100)
        serial.writeBuffer(cmdBuffer)
        setNormalMode()
        e32auxTimeout(100)
    }

    // Avanserte funksjoner
    //% block="til hex-streng"
    //% advanced=true
    export function hexString(value: number): string {
        return decToHexString(value, 16)
    }

    //% block="til binær-streng"
    //% advanced=true
    export function binaryString(value: number): string {
        return decToHexString(value, 2)
    }

    //% block="til desimal-streng"
    //% advanced=true
    export function decimalString(value: number): string {
        return decToHexString(value, 10)
    }
}
