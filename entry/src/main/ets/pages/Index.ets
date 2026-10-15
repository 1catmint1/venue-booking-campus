import { webview } from '@kit.ArkWeb';
import { fileIo, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { camera } from '@kit.CameraKit';
import { componentSnapshot } from '@kit.ArkUI';
import { image } from '@kit.ImageKit';

class LocalDemoBridge {
  private filePath: string = '';
  private context: common.UIAbilityContext | undefined = undefined;

  init(context: common.UIAbilityContext): void {
    this.context = context;
    this.filePath = context.filesDir + '/venue-demo-v2.json';
  }

  load(): string {
    if (!this.filePath) {
      throw new Error('Local demo store unavailable');
    }
    try {
      return fileIo.accessSync(this.filePath) ? fileIo.readTextSync(this.filePath) : '';
    } catch (_) {
      throw new Error('Local demo store read failed');
    }
  }

  save(value: string): string {
    if (!this.filePath || value.length > 4000000) {
      return 'error';
    }
    let opened: fileIo.File | undefined = undefined;
    try {
      const bytes = new util.TextEncoder().encodeInto(value);
      if (bytes.byteLength > 4000000) {
        return 'error';
      }
      opened = fileIo.openSync(this.filePath + '.tmp', fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
      const written = fileIo.writeSync(opened.fd, bytes.buffer as ArrayBuffer);
      if (written !== bytes.byteLength) {
        throw new Error('Local demo write was incomplete');
      }
      fileIo.fsyncSync(opened.fd);
      fileIo.closeSync(opened);
      opened = undefined;
      fileIo.renameSync(this.filePath + '.tmp', this.filePath);
      return 'ok';
    } catch (_) {
      if (opened) {
        try {
          fileIo.closeSync(opened);
        } catch (_) {
          // Preserve the old committed file; no external data is logged.
        }
      }
      return 'error';
    }
  }

  cameraStatus(): string {
    if (!this.context) {
      return '摄像头环境不可用，原图保留，请使用本地测试图片';
    }
    try {
      const devices = camera.getCameraManager(this.context).getSupportedCameras();
      return devices.length > 0 ? '检测到摄像头。本隐私演示不采集真实影像，请使用本地测试图片或虚拟拍摄。' : '未检测到摄像头，原图保留，可从本地文件选择测试图片。';
    } catch (_) {
      return '摄像头权限或能力不可用，原图保留，可从本地文件选择测试图片。';
    }
  }

  saveOwnedFrame(map: image.PixelMap, serial: number): void {
    if (!this.context) {
      return;
    }
    const target = this.context.filesDir + '/venue-native-frame.png';
    const packer = image.createImagePacker();
    packer.packing(map, { format: 'image/png', quality: 100 }).then((buffer: ArrayBuffer) => {
      let opened: fileIo.File | undefined = undefined;
      try {
        opened = fileIo.openSync(target, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
        const count = fileIo.writeSync(opened.fd, buffer);
        fileIo.fsyncSync(opened.fd);
        fileIo.closeSync(opened);
        opened = undefined;
        console.info('VenueDemo owned frame saved bytes=' + count.toString());
      } catch (_) {
        if (opened) {
          try { fileIo.closeSync(opened); } catch (_) { }
        }
        console.error('VenueDemo owned frame save failed');
      }
      const encoded = new util.Base64Helper().encodeToStringSync(new Uint8Array(buffer));
      const chunks = Math.ceil(encoded.length / 1000);
      console.info('VenueDemo frame stream begin serial=' + serial.toString() + ' bytes=' + buffer.byteLength.toString() + ' chunks=' + chunks.toString());
      for (let index = 0; index < chunks; index++) {
        console.info('VenueDemo frame chunk ' + serial.toString() + ' ' + index.toString() + ' ' + encoded.slice(index * 1000, (index + 1) * 1000));
      }
      console.info('VenueDemo frame stream end serial=' + serial.toString());
      packer.release();
      map.release();
    }).catch(() => {
      console.error('VenueDemo owned frame packing failed');
      packer.release();
      map.release();
    });
  }

  captureFrame(map: image.PixelMap, serial: number): void {
    this.saveOwnedFrame(map, serial);
  }
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: LocalDemoBridge = new LocalDemoBridge();
  @StorageLink('venueQaCaptureSerial') @Watch('captureRequested') private captureSerial: number = 0;

  aboutToAppear(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.bridge.init(context);
  }

  onBackPress(): boolean {
    try {
      this.controller.runJavaScript('window.venueBack && window.venueBack()');
    } catch (_) {
      // The offline page may still be loading.
    }
    return true;
  }

  private captureRequested(): void {
    if (this.captureSerial <= 0) {
      return;
    }
    setTimeout(() => {
      try {
        this.controller.runJavaScript('JSON.stringify({images:document.images.length,loaded:Array.from(document.images).filter(x=>x.complete&&x.naturalWidth>0).length,data:Array.from(document.images).filter(x=>x.src.startsWith("data:")).length})', (err, metrics) => {
          if (!err || err.code === 0) {
            console.info('VenueDemo DOM image metrics=' + metrics);
          } else {
            console.info('VenueDemo DOM image metrics unavailable');
          }
        });
      } catch (_) {
        console.info('VenueDemo DOM image metrics request unavailable');
      }
      try {
        componentSnapshot.get('VenueDemoSurface', (err, map) => {
          if ((err && err.code !== 0) || !map) {
            console.error('VenueDemo owned component capture failed');
            return;
          }
          this.bridge.captureFrame(map, this.captureSerial);
        });
      } catch (_) {
        console.error('VenueDemo owned component capture unavailable');
      }
    }, 700);
  }

  build() {
    Column() {
      Web({ src: $rawfile('index.html'), controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .imageAccess(true)
        .onlineImageAccess(true)
        .javaScriptProxy({
          object: this.bridge,
          name: 'demoNative',
          methodList: ['load', 'save', 'cameraStatus'],
          controller: this.controller
        })
        .onShowFileSelector((event) => {
          if (!event) { return false; }
          try {
            const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = 1;
            options.fileSuffixFilters = ['图片|.png|.jpg|.jpeg|.webp|.svg'];
            const selector = new picker.DocumentViewPicker(context);
            selector.select(options).then((files: Array<string>) => {
              event.result.handleFileList(files);
            }).catch(() => { event.result.handleFileList([]); });
          } catch (_) { event.result.handleFileList([]); }
          return true;
        })
        .onOverrideUrlLoading((event) => {
          if (!event) {
            return true;
          }
          const url: string = event.getRequestUrl();
          return url.startsWith('https:') || url.startsWith('http:') || url.startsWith('intent:') || url.startsWith('tel:');
        })
        .onPageEnd(() => {
          console.info('VenueDemo offline page load completed');
          this.captureRequested();
        })
        .width('100%')
        .height('100%')
        .id('VenueDemoSurface')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F6F9FC')
  }
}
