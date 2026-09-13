declare module "docxtemplater-image-module-free" {
  export interface ImageModuleOptions {
    getImage: (tagValue: string, tagName: string) => ArrayBuffer;
    getSize: (imgBuffer: ArrayBuffer, tagValue: string, tagName: string) => [number, number];
    centered?: boolean;
  }

  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
