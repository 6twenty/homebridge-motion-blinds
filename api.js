import dgram from "dgram"
import crypto from "crypto"
import EventEmitter from "events"

const KEY = "d5d967ca-5d37-4c"
const BRIDGE_ADDRESS = "192.168.178.22"
const UNICAST_PORT = 32100
const MULTICAST_PORT = 32101
const MULTICAST_ADDRESS = "238.0.0.18"
const SELF_ADDRESS = "0.0.0.0"
const BRIDGE_TYPE = "02000001"
const DEVICE_TYPE = "10000000"

class Bridge extends EventEmitter {
  constructor(api, mac, token) {
    super()

    this.api = api
    this.mac = mac
    this.token = token
    this.devices = new Map()
    this.state = {}

    this.update = this.update.bind(this)
    this.send = this.send.bind(this)

    this.setAccessToken()
    this.update().then(() => {
      this.api.emit("bridge-added", this)
    })
  }

  update() {
    const promises = [
      this.readDevice(),
      this.getDevices()
    ]

    return Promise.all(promises)
  }

  setState(state) {
    const changes = {}

    for (const property of Object.keys(state)) {
      const oldValue = this.state[property]
      const newValue = state[property]

      if (oldValue !== newValue) {
        changes[property] = [oldValue, newValue]
      }
    }

    this.state = state

    this.emit("updated", changes)
  }

  readDevice() {
    return this.send("ReadDevice").then(({ data }) => {
      this.setState(data)
    })
  }

  getDevices() {
    return this.send("GetDeviceList").then(({ fwVersion, ProtocolVersion, data }) => {
      this.fwVersion = fwVersion
      this.ProtocolVersion = ProtocolVersion

      this.setDevices(data)
    })
  }

  encrypt(token, key) {
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null)
    const buffer = Buffer.concat([cipher.update(token), cipher.final()])

    return buffer.toString("hex").substring(0, 32).toUpperCase()
  }

  // TODO: check if any previously known devices are no longer in the set
  setDevices(deviceData) {
    for (const { mac, deviceType } of deviceData) {
      if (deviceType === DEVICE_TYPE) {
        this.devices.set(mac, new Device(this, mac))
      }
    }
  }

  setAccessToken() {
    this.accessToken = this.encrypt(this.token, KEY)
  }

  send(msgType, options = {}) {
    return new Promise((resolve, _reject) => {
      this.api.queueCall(msgType, {
        mac: this.mac,
        deviceType: BRIDGE_TYPE,
        accessToken: this.accessToken,
        ...options
      }, data => resolve(data))
    })
  }
}

class Device extends EventEmitter {
  constructor(bridge, mac) {
    super()

    this.bridge = bridge
    this.mac = mac
    this.state = {}
    this.ignoreReport = false

    this.update = this.update.bind(this)
    this.send = this.send.bind(this)
    this.writeDevice = this.writeDevice.bind(this)

    this.update().then(() => {
      this.bridge.api.emit("device-added", this)
    })
  }

  update() {
    return this.readDevice()
  }

  setState(state) {
    const changes = {}

    for (const property of Object.keys(state)) {
      const oldValue = this.state[property]
      const newValue = state[property]

      if (oldValue !== newValue) {
        changes[property] = [oldValue, newValue]
      }
    }

    this.state = state

    this.emit("updated", changes)
  }

  ignoreNextReport() {
    this.ignoreReport = true
  }

  readDevice() {
    return this.send("ReadDevice").then(({ data }) => {
      this.setState(data)
    })
  }

  writeDevice(data) {
    // Ignore the WriteDeviceAck response, as it just returns an unchanged state
    // (even operation does not reflect the write action); instead just wait for
    // the subsequnt Report that gets sent when the operation stops
    return this.send("WriteDevice", { data })
  }

  send(msgType, options = {}) {
    return this.bridge.send(msgType, {
      mac: this.mac,
      deviceType: DEVICE_TYPE,
      ...options
    })
  }
}

export default class ApiClient extends EventEmitter {
  constructor(logger) {
    super()

    this.log = logger || console
    this.bridges = new Map()
    this.currentMessage = null
    this.messageQueue = []

    this.queueCall = this.queueCall.bind(this)

    // Always listen for multicast messages so that Report and Heartbeat
    // messages can be received at all times
    this.startListening()

    // Initial device discovery
    this.discover()
  }

  startListening() {
    this.log.debug(`Listening on multicast ${MULTICAST_ADDRESS}:${MULTICAST_PORT}`)

    const multicast = dgram.createSocket("udp4")

    multicast.bind(MULTICAST_PORT, SELF_ADDRESS, () => {
      multicast.addMembership(MULTICAST_ADDRESS, SELF_ADDRESS)
    })

    // Multicast messages announce changes to the state of each blind
    multicast.on("message", (data, _remote) => {
      const parsedData = JSON.parse(data)
      const { msgType, mac, deviceType } = parsedData

      this.log.debug(`Multicast message ${msgType} from ${mac}: ${data}`)

      if (msgType === "Heartbeat" && deviceType === BRIDGE_TYPE) {
        this.handleHeartbeat(parsedData)
      } else if (msgType === "Report") {
        this.handleReport(parsedData)
      }
    })

    multicast.on("close", () => {
      this.log.debug(`Multicast socket closed! Reconnecting...`)
      this.startListening()
    })
  }

  handleHeartbeat({ mac, token, data: state }) {
    // Known bridge: check that the correct number of devices are known
    // Unknown bridge: add it and its devices
    if (this.bridges.has(mac)) {
      const bridge = this.bridges.get(mac)

      if (bridge.devices.size !== state.numberOfDevices) {
        this.log.debug("Known bridge has different number of devices")
        bridge.update()
      }
    } else {
      this.log.debug("New bridge discovered")
      this.bridges.set(mac, new Bridge(this, mac, token))
    }
  }

  handleReport(parsedData) {
    const { mac, data: state } = parsedData

    this.bridges.forEach((bridge, _) => {
      if (bridge.devices.has(mac)) {
        const device = bridge.devices.get(mac)

        if (device.ignoreReport) {
          device.ignoreReport = false
        } else {
          device.setState(state)
        }
      }
    })
  }

  discover() {
    this.call("GetDeviceList", {}, ({ mac, token, deviceType }) => {
      if (deviceType === BRIDGE_TYPE) {
        this.bridges.set(mac, new Bridge(this, mac, token))
      }
    })
  }

  queueCall(msgType, options, callback) {
    this.messageQueue.push([msgType, options, callback])
    this.callNext()
  }

  call(msgType, { data, mac, deviceType, accessToken }, callback) {
    const responseMsgType = `${msgType}Ack`
    // When not sending to any particular device, keep the socket open for a set
    // period of time in order to wait for all responses to come in
    const keepAlive = mac == null
    // NOTE: according to the spec an incrementing msgID value should be
    // supplied, but in practice it doesn't appear to be necessary
    const json = { msgType }
    let timer

    if (mac && deviceType && accessToken) {
      json.mac = mac
      json.deviceType = deviceType
      json.AccessToken = accessToken

      if (data) {
        json.data = data
      }
    }

    const msg = Buffer.from(JSON.stringify(json))
    const unicast = dgram.createSocket("udp4")

    function close() {
      clearTimeout(timer)
      unicast.close()
    }

    unicast.bind()

    unicast.on("message", (data) => {
      const parsedData = JSON.parse(data)
      const { msgType, mac } = parsedData

      // Unless expecting multiple responses, ignore messages from other devices
      if (!keepAlive && json.mac !== mac) {
        return close()
      }

      // Ignore messages without the expected response type
      if (responseMsgType !== msgType) {
        return close()
      }

      this.log.debug(`Unicast message ${msgType} from ${mac}`, parsedData)

      callback(parsedData)

      // Unless expecting multiple responses, now that a response has been
      // received, the socket can be closed
      if (!keepAlive) {
        this.currentMessage = null

        close()
        this.callNext()
      }
    })

    this.log.debug(`Sending ${msgType} to ${mac || "all"}`, data)

    unicast.send(msg, 0, msg.length, UNICAST_PORT, BRIDGE_ADDRESS)

    // Keep socket open a max of 5s
    timer = setTimeout(() => close(), 5000)
  }

  callNext() {
    // Bail if there's a call in progress or if there are no calls queued
    if (this.currentMessage != null || this.messageQueue.length === 0) {
      return
    }

    this.currentMessage = this.messageQueue.shift()

    this.call(...this.currentMessage)
  }
}
