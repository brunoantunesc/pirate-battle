import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { GameSimulation, Ship, ShipKind } from './simulation';
import { BattleAudio } from './audio';

const root = '/assets/png/default/';
const paths = {
  player: `${root}ships/ship_2.png`, playerDamaged: `${root}ships/ship_8.png`,
  chaser: `${root}ships/ship_3.png`, chaserDamaged: `${root}ships/ship_9.png`,
  shooter: `${root}ships/ship_5.png`, shooterDamaged: `${root}ships/ship_11.png`,
  ball: `${root}ship_parts/cannon_ball.png`, explosion: `${root}effects/explosion_1.png`,
  fire: `${root}effects/fire_1.png`, tiles: '/assets/tilesheet/tiles_sheet.png',
} as const;
type Textures = Record<keyof typeof paths, Texture>;
const damagedTextures: Record<ShipKind, keyof Textures> = {
  player: 'playerDamaged', chaser: 'chaserDamaged', shooter: 'shooterDamaged',
};
let texturePromise: Promise<Textures> | undefined;

export function loadTextures(): Promise<Textures> {
  if (!texturePromise) {
    texturePromise = Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await Assets.load<Texture>(path)] as const))
      .then((entries) => Object.fromEntries(entries) as Textures)
      .catch((error: unknown) => { texturePromise = undefined; throw error; });
  }
  return texturePromise;
}

interface ShipView { group: Container; sprite: Sprite; shadow: Sprite; fire: Sprite; health: Graphics; wake: Graphics; healthValue: number }

/** Owns scene objects; shared Assets textures deliberately outlive individual matches. */
export class BattleRenderer {
  private ships = new Map<number, ShipView>();
  private balls = new Map<number, Sprite>();
  private explosions = new Map<number, Sprite>();
  private water: TilingSprite;
  private entityLayer = new Container();
  private effectLayer = new Container();
  private subtextures: Texture[] = [];
  private audio = new BattleAudio();
  private previousStatus: string = 'running';

  constructor(private app: Application, private simulation: GameSimulation, private textures: Textures) {
    const { width, height } = simulation.config.arena;
    const slice = (x: number, y: number, w: number, h: number) => {
      const texture = new Texture({ source: textures.tiles.source, frame: new Rectangle(x, y, w, h) });
      this.subtextures.push(texture);
      return texture;
    };
    this.water = new TilingSprite({ texture: slice(512, 256, 64, 64), width, height });
    this.water.tint = 0x65cad5;
    this.water.tileScale.set(2);
    app.stage.addChild(this.water);
    const depth = new Graphics().rect(0, 0, width, height).fill({ color: 0x063b5a, alpha: 0.12 });
    app.stage.addChild(depth);
    const decoration = new Graphics();
    for (let x = 60; x < width; x += 120) {
      for (let y = 60; y < height; y += 120) {
        decoration.moveTo(x - 4, y).lineTo(x + 4, y).moveTo(x, y - 4).lineTo(x, y + 4);
      }
    }
    decoration.stroke({ width: 1, color: 0xc7f7f3, alpha: 0.12 });
    app.stage.addChild(decoration);
    const foliage = slice(384, 256, 64, 64);
    const rock = slice(64, 192, 64, 64);
    for (const [index, island] of simulation.config.islands.entries()) {
      const { x, y, radius: r } = island;
      const land = new Graphics()
        .circle(x, y, r + 19).fill({ color: 0xb4f1dd, alpha: 0.19 })
        .circle(x, y, r + 9).fill({ color: 0xc4f0d8, alpha: 0.33 })
        .circle(x + 2, y + 6, r).fill(0x887a4d)
        .circle(x, y, r).fill(0xeacb8d)
        .circle(x - 3, y - 3, r - 14).fill(0x66863c)
        .circle(x - 9, y - 11, r - 23).fill(0x809a46);
      app.stage.addChild(land);
      for (let j = 0; j < 4; j++) {
        const palm = new Sprite(foliage);
        palm.anchor.set(0.5); palm.position.set(x + Math.cos(j * 2.1 + index) * r * 0.5, y + Math.sin(j * 2.1 + index) * r * 0.47);
        palm.scale.set(j === 0 ? 1.1 : 0.78); palm.rotation = j;
        app.stage.addChild(palm);
      }
      const stone = new Sprite(rock); stone.anchor.set(0.5); stone.position.set(x + r * 0.4, y + r * 0.32); stone.scale.set(0.7);
      app.stage.addChild(stone);
    }
    app.stage.addChild(this.entityLayer, this.effectLayer);
    const edge = new Graphics().rect(2, 2, width - 4, height - 4).stroke({ width: 4, color: 0xe7cc8f, alpha: 0.5 });
    app.stage.addChild(edge);
  }

  private createShip(ship: Ship): ShipView {
    const group = new Container();
    const shadow = new Sprite(this.textures[ship.kind]);
    shadow.anchor.set(0.5); shadow.tint = 0x032c38; shadow.alpha = 0.28;
    const sprite = new Sprite(this.textures[ship.kind]); sprite.anchor.set(0.5);
    const scale = (ship.radius * 2.65) / sprite.height;
    sprite.scale.set(scale); shadow.scale.set(scale);
    const health = new Graphics(), wake = new Graphics();
    const fire = new Sprite(this.textures.fire); fire.anchor.set(0.5, 0.8); fire.scale.set(0.65); fire.visible = false;
    group.addChild(wake, shadow, sprite, fire, health);
    this.entityLayer.addChild(group);
    return { group, shadow, sprite, health, wake, fire, healthValue: -1 };
  }

  render() {
    const state = this.simulation.state;
    if (state.status !== this.previousStatus && state.status !== 'running') this.audio.stop();
    this.previousStatus = state.status;
    this.water.tilePosition.set(state.time * 3, Math.sin(state.time * 0.2) * 8);
    const liveShips = new Set<number>();
    for (const ship of [state.player, ...state.enemies]) {
      liveShips.add(ship.id);
      let view = this.ships.get(ship.id);
      if (!view) { view = this.createShip(ship); this.ships.set(ship.id, view); }
      view.group.position.set(ship.x, ship.y);
      view.sprite.rotation = ship.angle - Math.PI / 2;
      view.shadow.rotation = view.sprite.rotation; view.shadow.position.set(5, 8);
      const fraction = Math.max(0, ship.hp / ship.maxHp);
      view.sprite.texture = this.textures[fraction < 0.65 ? damagedTextures[ship.kind] : ship.kind];
      view.sprite.tint = ship.flash > 0 ? 0xffa39b : fraction < 0.35 ? 0xbda99a : 0xffffff;
      view.fire.visible = fraction > 0 && fraction < 0.35;
      view.fire.rotation = Math.sin(state.time * 18) * 0.1;
      view.fire.alpha = 0.75 + Math.sin(state.time * 22) * 0.2;
      view.wake.clear();
      if ((ship.kind !== 'player' || this.simulation.input.forward) && state.status === 'running') {
        const backwardsX = -Math.cos(ship.angle), backwardsY = -Math.sin(ship.angle);
        view.wake.moveTo(backwardsX * 16, backwardsY * 16)
          .lineTo(backwardsX * 55 + backwardsY * 13, backwardsY * 55 - backwardsX * 13)
          .moveTo(backwardsX * 16, backwardsY * 16)
          .lineTo(backwardsX * 55 - backwardsY * 13, backwardsY * 55 + backwardsX * 13)
          .stroke({ width: 2, color: 0xe1fffa, alpha: 0.25 });
      }
      if (view.healthValue !== ship.hp) {
        view.healthValue = ship.hp;
        const y = -ship.radius - 20;
        view.health.clear().roundRect(-25, y, 50, 7, 3).fill(0x102e32)
          .roundRect(-24, y + 1, 48 * fraction, 5, 2).fill(ship.kind === 'player' ? 0xa7df75 : 0xf27458)
          .roundRect(-25, y, 50, 7, 3).stroke({ width: 1, color: 0xf0d292, alpha: 0.8 });
      }
    }
    for (const [id, view] of this.ships) if (!liveShips.has(id)) { view.group.destroy({ children: true }); this.ships.delete(id); }
    const liveBalls = new Set<number>();
    for (const ball of state.projectiles) {
      liveBalls.add(ball.id);
      let sprite = this.balls.get(ball.id);
      if (!sprite) { sprite = new Sprite(this.textures.ball); sprite.anchor.set(0.5); this.entityLayer.addChild(sprite); this.balls.set(ball.id, sprite); }
      sprite.position.set(ball.x, ball.y); sprite.width = ball.radius * 2; sprite.height = ball.radius * 2;
      sprite.tint = ball.owner === 'enemy' ? 0xffa886 : 0xffffff;
    }
    for (const [id, sprite] of this.balls) if (!liveBalls.has(id)) { sprite.destroy(); this.balls.delete(id); }
    const liveEffects = new Set<number>();
    for (const effect of state.effects) {
      liveEffects.add(effect.id);
      let sprite = this.explosions.get(effect.id);
      if (!sprite) {
        sprite = new Sprite(this.textures.explosion); sprite.anchor.set(0.5); this.effectLayer.addChild(sprite); this.explosions.set(effect.id, sprite);
        if (state.status === 'running') this.audio.play(effect.kind === 'shot' ? 'cannon_fire_1' : effect.kind === 'explosion' ? 'ship_explosion_1' : 'ship_wood_hit_1', state.time);
      }
      const remaining = effect.life / effect.maxLife;
      sprite.position.set(effect.x, effect.y); sprite.alpha = Math.min(1, remaining * 2);
      sprite.scale.set((effect.kind === 'explosion' ? 1.25 : effect.kind === 'hit' ? 0.46 : 0.22) * (1.4 - remaining * 0.7));
    }
    for (const [id, sprite] of this.explosions) if (!liveEffects.has(id)) { sprite.destroy(); this.explosions.delete(id); }
  }

  setSound(enabled: boolean) { this.audio.enabled = enabled; if (!enabled) this.audio.stop(); }
  destroy() {
    this.audio.stop();
    this.ships.clear(); this.balls.clear(); this.explosions.clear();
    for (const texture of this.subtextures) texture.destroy(false);
    this.subtextures = [];
  }
}
