import { UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want): void {
    AppStorage.setOrCreate('venueQaCaptureSerial', want.parameters?.qaCapture === true ? 1 : 0);
  }

  onNewWant(want: Want): void {
    if (want.parameters?.qaCapture === true) {
      const serial = AppStorage.get<number>('venueQaCaptureSerial') || 0;
      AppStorage.setOrCreate('venueQaCaptureSerial', serial + 1);
    }
  }

  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Index', (err) => {
      if (err.code) {
        console.error('VenueDemo UI load failed: ' + err.code.toString());
      }
    });
  }
}
