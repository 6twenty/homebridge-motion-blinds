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
    this.positionState = STOPPED

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
      this.platform.log.debug("Device updated", accessory.displayName, device.state, changes)

      clearTimeout(this.fallbackTimer)

      const currentPosition = this.getCurrentPosition()

      const setFinalPosition = (position) => {
        this.targetPosition = position
        this.positionState = STOPPED

        this.characteristics.TargetPosition.updateValue(this.targetPosition)
        this.characteristics.PositionState.updateValue(this.positionState)
      }

      if (this.positionState !== STOPPED) {
        if (currentPosition === this.targetPosition) {
          this.platform.log.debug("Device reached target position", accessory.displayName, this.targetPosition)
          setFinalPosition(currentPosition)
        } else {
          // Wait 5s then check if the position is still the same - if so,
          // consider that the final position even if it doesn't match the
          // target position
          this.fallbackTimer = setTimeout(() => {
            this.device.update().then(() => {
              if (this.positionState !== STOPPED) {
                if (currentPosition === this.getCurrentPosition()) {
                  this.platform.log.debug("Device no longer in motion", accessory.displayName, currentPosition)
                  setFinalPosition(currentPosition)
                } else {
                  // Device still in motion
                  this.platform.log.debug("Device still in motion", accessory.displayName)
                }
              }
            })
          }, 5000)
        }
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

    // Homebridge values:
    // 0 = fully closed
    // 100 = fully open
    if (value > currentPosition) {
      this.positionState = OPENING
    } else if (value < currentPosition) {
      this.positionState = CLOSING
    } else {
      this.positionState = STOPPED
    }

    this.characteristics.PositionState.updateValue(this.positionState)

    this.targetPosition = value

    if (this.positionState === STOPPED) {
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
    // The position state on the device ("operation") isn't trusted as it always
    // returns STOPPED, so the position state is managed manually
    return this.positionState
  }
}
