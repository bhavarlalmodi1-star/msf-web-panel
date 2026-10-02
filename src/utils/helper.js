import * as UAParser from "ua-parser-js";
export const getDeviceInfo = () => {
    const parser = new UAParser.UAParser(); // Use UAParser from the imported object
    const result = parser.getResult();
  console.log(result,'result')
    return {
      os: result.os.name ,
      browser: result.browser.name + " " + result.browser.version || '',
      device: result.device.type || "desktop",
    };
  };