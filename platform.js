import { PLUGIN_NAME, PLATFORM_NAME } from "./settings"
import MotionAPI from "./api"
import MotionBlindsAccessory from "./accessory"

export default class MotionBlindsPlatform {
  constructor(log, _config, api) {
    this.log = log
    this.api = api
    this.accessories = []

    api.on("didFinishLaunching", () => {
      this.discoverDevices()
    })
  }

  discoverDevices() {
    const motion = new MotionAPI()

    motion.on("device-added", (device) => {
      this.addDiscoveredDevice(device)
    })
  }

  /**
   * REQUIRED - Homebridge will call the "configureAccessory" method once for
   * every cached accessory restored
   */
  configureAccessory(accessory) {
    this.log("Loading accessory from cache:", accessory.displayName)

    this.accessories.push(accessory)
  }

  addDiscoveredDevice(device) {
    const uuid = this.api.hap.uuid.generate(device.mac)
    const existingAccessory = this.accessories.find((accessory) => {
      return accessory.UUID === uuid
    })

    if (existingAccessory) {
      this.log.info(
        "Restoring existing accessory from cache:",
        existingAccessory.displayName
      )

      new MotionBlindsAccessory(this, existingAccessory, device)
    } else {
      const displayName = `Motion Blind ${device.mac}`

      this.log.info("Adding new accessory:", displayName)

      const accessory = new this.api.platformAccessory(displayName, uuid)

      this.accessories.push(accessory)

      new MotionBlindsAccessory(this, accessory, device)

      this.api.registerPlatformAccessories(
        PLUGIN_NAME, PLATFORM_NAME, [accessory]
      )
    }
  }
}
