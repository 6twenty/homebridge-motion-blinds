const CLOSING = 0
const OPENING = 1
const STOPPED = 2
const STATUS_QUERY = 5

export default class MotionBlindsAccessory {
  constructor(platform, accessory, device) {
    this.platform = platform
    this.accessory = accessory
    this.device = device

    accessory.on("identify", () => {
      this.platform.log(`${accessory.displayName} identified!`)

      // Also trigger an update as a way to force-sync the device state
      this.device.update()
    })

    const Service = platform.api.hap.Service
    const Characteristic = platform.api.hap.Characteristic

    const service = accessory.getService(Service.WindowCovering) ||
      accessory.addService(Service.WindowCovering)

    service.setCharacteristic(Characteristic.Name, accessory.displayName)

    service.getCharacteristic(Characteristic.CurrentPosition).
      onGet(() => this.getCurrentPosition())

    service.getCharacteristic(Characteristic.TargetPosition).
      onGet(() => this.getTargetPosition()).
      onSet((value) => this.setTargetPosition(value))

    // API "operation" | HAP "PositionState"
    // 0: Close/Down   | DECREASING
    // 1: Open/Up      | INCREASING
    // 2: Stop         | STOPPED
    // 5: Status query | - (treated as STOPPED)
    service.getCharacteristic(Characteristic.PositionState).
      onGet(() => this.getPositionState())

    device.on("updated", (changes) => {
      if ("currentPosition" in changes) {
        service.setCharacteristic(
          Characteristic.CurrentPosition, this.getCurrentPosition()
        )
      }

      if ("operation" in changes) {
        service.setCharacteristic(
          Characteristic.PositionState, this.getPositionState()
        )

        // When movement stops, ensure the target position is in sync with the
        // current position
        if (value === STOPPED) {
          service.setCharacteristic(
            Characteristic.TargetPosition, this.getCurrentPosition()
          )
        }
      }
    })
  }

  getCurrentPosition() {
    // Position values are inverted to what homebridge uses
    const value = 100 - this.device.state.currentPosition

    this.platform.log.debug("Get Characteristic CurrentPosition ->", value)

    return value
  }

  getTargetPosition() {
    // The target position isn't stored on the device so it's just cached
    // locally
    const value = this.targetPosition

    this.platform.log.debug("Get Characteristic TargetPosition ->", value)

    return value
  }

  setTargetPosition(value) {
    // Position values are inverted to what homebridge uses
    value = 100 - value

    this.targetPosition = value

    this.platform.log.debug("Set Characteristic TargetPosition ->", value)

    this.device.writeDevice({ targetPosition: value })
  }

  getPositionState() {
    let value = this.device.state.operation

    // Fallback in case the device state hasn't been set yet
    if (value == null) {
      value = STOPPED
    }

    // Operation enum mirrors homebridge except for one additional value
    // (5: "Status query") which is ignored
    if (value === STATUS_QUERY) {
      value = STOPPED
    }

    this.platform.log.debug("Get Characteristic PositionState ->", value)

    return value
  }
}
