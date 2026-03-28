import { GameScene } from '../scene/GameScene';
import { events } from './Events';

export class SceneManager {
	private activeScene: GameScene | null = null;

	loadScene(scene: GameScene): void {
		if (this.activeScene) {
			this.activeScene.dispose();
		}
		this.activeScene = scene;
		this.activeScene.init();
		events.emit('scene:loaded');
		console.log('[SceneManager] Scene loaded.');
	}

	getActiveScene(): GameScene {
		if (!this.activeScene) {
			throw new Error('[SceneManager] No active scene.');
		}
		return this.activeScene;
	}

	update(delta: number): void {
		if (this.activeScene) {
			this.activeScene.update(delta);
		}
	}

	dispose(): void {
		if (this.activeScene) {
			this.activeScene.dispose();
			this.activeScene = null;
		}
	}
}
