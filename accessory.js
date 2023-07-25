const CLOSING = 0
const OPENING = 1
const STOPPED = 2
const STATUS_QUERY = 5

export default class MotionBlindsAccessory {
  constructor(platform, accessory, device) {
    this.platform = platform
    this.accessory = accessory
    this.device = device

    // Initial target position is synced to the current position
    this.targetPosition = this.getCurrentPosition()

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

    service.getCharacteristic(Characteristic.CurrentPosition).onGet(() => {
      const value = this.getCurrentPosition()

      this.platform.log.debug("Get CurrentPosition", accessory.displayName, value)

      return value
    })

    service.getCharacteristic(Characteristic.TargetPosition).onGet(() => {
      const value = this.getTargetPosition()

      this.platform.log.debug("Get TargetPosition", accessory.displayName, value)

      return value
    }).onSet((value) => {
      this.platform.log.debug("Set TargetPosition", accessory.displayName, value)

      this.setTargetPosition(value)
    })

    // API "operation" | HAP "PositionState"
    // 0: Close/Down   | DECREASING
    // 1: Open/Up      | INCREASING
    // 2: Stop         | STOPPED
    // 5: Status query | - (treated as STOPPED)
    service.getCharacteristic(Characteristic.PositionState).onGet(() => {
      const value = this.getPositionState()

      this.platform.log.debug("Get PositionState", accessory.displayName, value)

      return value
    })

    device.on("updated", (changes) => {
      this.platform.log.debug("Device updated", accessory.displayName, device.state, changes)

      const currentPosition = this.getCurrentPosition()
      const positionState = this.getPositionState()

      service.getCharacteristic(Characteristic.CurrentPosition).
        updateValue(currentPosition)

      service.getCharacteristic(Characteristic.PositionState).
        updateValue(positionState)

      // When movement is stopped, ensure the target position is in sync with
      // the current position
      if (positionState === STOPPED) {
        service.getCharacteristic(Characteristic.TargetPosition).
          updateValue(currentPosition)
      }
    })
  }

  getCurrentPosition() {
    // Position values are inverted to what homebridge uses
    return 100 - this.device.state.currentPosition
  }

  getTargetPosition() {
    // The target position isn't stored on the device so it's just cached
    // locally
    return this.targetPosition
  }

  setTargetPosition(value) {
    // Position values are inverted to what homebridge uses
    value = 100 - value

    this.targetPosition = value

    this.device.writeDevice({ targetPosition: value })
  }

  getPositionState() {
    const value = this.device.state.operation

    // Fallback in case the device state hasn't been set yet
    if (value == null) {
      return STOPPED
    }

    // Operation enum mirrors homebridge except for one additional value
    // (5: "Status query") which is ignored
    if (value === STATUS_QUERY) {
      return STOPPED
    }

    return value
  }
}
