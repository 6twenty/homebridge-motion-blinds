const CLOSING = 0
const OPENING = 1
const STOPPED = 2

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

    const { Service, Characteristic } = platform.api.hap

    const info = accessory.getService(Service.AccessoryInformation) ||
      accessory.addService(Service.AccessoryInformation)

    info.setCharacteristic(Characteristic.Manufacturer, "Roller Blind")
    info.setCharacteristic(Characteristic.Model, `MAC: ${device.mac}`)
    info.setCharacteristic(Characteristic.SerialNumber, `Battery: ${device.state.batteryLevel}`)

    const service = accessory.getService(Service.WindowCovering) ||
      accessory.addService(Service.WindowCovering)

    service.setCharacteristic(Characteristic.Name, accessory.displayName)

    this.characteristics = {
      SerialNumber: info.getCharacteristic(Characteristic.SerialNumber),
      CurrentPosition: service.getCharacteristic(Characteristic.CurrentPosition),
      TargetPosition: service.getCharacteristic(Characteristic.TargetPosition),
      PositionState: service.getCharacteristic(Characteristic.PositionState)
    }

    this.characteristics.PositionState.onGet(() => {
      const value = this.getPositionState()

      this.platform.log.debug("Get Position State", accessory.displayName, value)

      return value
    })

    this.characteristics.CurrentPosition.onGet(() => {
      const value = this.getCurrentPosition()

      this.platform.log.debug("Get Current Position", accessory.displayName, value)

      return value
    })

    this.characteristics.TargetPosition.onGet(() => {
      const value = this.getTargetPosition()

      this.platform.log.debug("Get Target Position", accessory.displayName, value)

      return value
    }).onSet((value) => {
      this.platform.log.debug("Set Target Position", accessory.displayName, value)

      this.setTargetPosition(value)
    })

    device.on("updated", (changes) => {
      clearTimeout(this.fallbackTimer)

      const currentPosition = this.getCurrentPosition()

      const setFinalPosition = (position) => {
        this.targetPosition = position

        this.characteristics.TargetPosition.updateValue(this.targetPosition)
      }

      this.platform.log.debug("Device updated", accessory.displayName, device.state, changes)

      if (!("currentPosition" in changes)) {
        // Position hasn't changed - treat this as the final intended position
        this.platform.log.debug("Device at final position", accessory.displayName, currentPosition)
        setFinalPosition(currentPosition)
      } else if (currentPosition === this.targetPosition) {
        // Position has changed and has reached target
        this.platform.log.debug("Device reached target position", accessory.displayName, currentPosition)
        setFinalPosition(currentPosition)
      } else {
        // Position has changed but has not reached target; wait 5s then check again
        this.platform.log.debug("Device in motion", accessory.displayName, currentPosition)
        this.fallbackTimer = setTimeout(() => this.device.update(), 5000)
      }

      this.characteristics.CurrentPosition.updateValue(currentPosition)
      this.characteristics.SerialNumber.updateValue(`Battery: ${this.device.state.batteryLevel}`)
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
    const currentPosition = this.getCurrentPosition()

    this.targetPosition = value

    if (this.targetPosition === currentPosition) {
      return // Nothing to do
    }

    // Position values are inverted to what homebridge uses
    this.device.writeDevice({ targetPosition: 100 - this.targetPosition })

    // Once the device motion stops it'll send a Report message with its new
    // position (which may also happen while device position is still being
    // set in the UI); that triggers the "updated" handler which will check if
    // the device is in its final position or not. If not, it'll wait 5s and
    // check if the device is in fact still in motion; if not, it'll assume that
    // it's at its intended final position (even if that isn't the target
    // position)
  }

  getPositionState() {
    // Homekit seems to ignore this anyway, so screw it
    return STOPPED
  }
}
