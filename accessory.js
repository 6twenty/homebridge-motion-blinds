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

    const service = accessory.getService(Service.WindowCovering) ||
      accessory.addService(Service.WindowCovering)

    service.setCharacteristic(Characteristic.Name, accessory.displayName)

    this.characteristics = {
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

      const currentPosition = this.getCurrentPosition()

      this.characteristics.CurrentPosition.updateValue(currentPosition)
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

    this.targetPosition = value

    if (this.positionState === STOPPED) {
      return // Nothing to do
    }

    this.awaitPosition().then(() => {
      this.positionState = STOPPED
    })

    // Position values are inverted to what homebridge uses
    this.device.writeDevice({ targetPosition: 100 - this.targetPosition })
  }

  getPositionState() {
    // The position state on the device ("operation") isn't trusted as it always
    // returns STOPPED, so the position state is managed manually
    return this.positionState
  }

  // Polls the current position and wait for it to stop changing
  awaitPosition() {
    return new Promise((resolve, _reject) => {
      let lastKnownPosition = this.getCurrentPosition()
      let pollTimer
      let waitTimer

      const poll = () => {
        pollTimer = setTimeout(() => {
          this.device.update().then(() => {
            const currentPosition = this.getCurrentPosition()

            if (lastKnownPosition === currentPosition) {
              this.platform.log.debug("Polling complete", accessory.displayName, currentPosition)

              // Even if the current position isn't what the target position was
              // set to, assume that this is the intended final position
              this.targetPosition = currentPosition

              clearTimeout(waitTimer)
              resolve()
            } else {
              lastKnownPosition = currentPosition

              poll()
            }
          })
        }, 500)
      }

      poll()

      // Only wait for a max of 30 seconds
      waitTimer = setTimeout(() => {
        this.targetPosition = this.getCurrentPosition()

        clearTimeout(pollTimer)
        resolve()
      })
    })
  }
}
