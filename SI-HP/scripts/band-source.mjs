export const productionSheetUrl = 'https://docs.google.com/spreadsheets/d/1fwkoyzz8c82Soh-2WKxwMLl_oMmb-u_cnC5cc6aMP9Y/export?format=csv&gid=554969304'
export const testSheetUrl = 'https://docs.google.com/spreadsheets/d/1DzdgqNtbOWJ6PAF1QusKWaeD-vmw7pfLBOJr-8WUiXI/export?format=csv&gid=0'
export function sourceConfig(testMode = false) {
  return testMode
    ? { url: testSheetUrl, directory: '../test-public/data/', environment: 'test' }
    : { url: productionSheetUrl, directory: '../public/data/', environment: 'production' }
}
