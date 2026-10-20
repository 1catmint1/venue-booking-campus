import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Index', (err) => {
      if (err.code) { console.error('VenueDemo UI load failed: ' + err.code.toString()); }
    });
  }
}
