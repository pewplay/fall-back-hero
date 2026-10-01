(() => {
  // src/sfx.ts
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  window.OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  var out = null;
  var master = null;
  var gains = {};
  var buffers = {};
  var keys = { c: 0, db: 1, d: 2, eb: 3, e: 4, f: 5, gb: 6, g: 7, ab: 8, a: 9, bb: 10, b: 11 };
  var freq = [];
  var bitrate = 44100;
  var noise;
  var Sound = class {
    constructor(type, curve, length) {
      this.type = type;
      this.length = length;
      this.curve = Float32Array.from(curve);
    }
    getTime(max) {
      return (max < this.length ? max : this.length) - 0.01;
    }
  };
  var Channel = class {
    constructor(inst, notes, tempo) {
      this.inst = inst;
      this.size = 0;
      this.length = 0;
      this.data = [];
      let sheet = notes.split("|");
      if (sheet.length > 1) {
        notes = "";
        for (let i = 0; i < sheet.length; i++) {
          notes += i % 2 ? ("," + sheet[i - 1]).repeat(parseInt(sheet[i]) - 1) : (notes ? "," : "") + sheet[i];
        }
      }
      notes.split(",").forEach((code) => {
        let div = code.match(/^([\d\.]+)/), freqs = code.match(/([a-z]+\d+)/g);
        if (div) {
          let time2 = tempo * parseFloat(div[1]), row = [time2];
          this.length += time2;
          if (freqs) {
            if (freqs.length > this.size) {
              this.size = freqs.length;
            }
            for (let i = 0; i < freqs.length; i++) {
              let note = freqs[i].match(/([a-z]+)(\d+)/);
              if (note) {
                row.push(freq[parseInt(note[2]) * 12 + keys[note[1]]]);
              }
            }
          }
          this.data.push(row);
        }
      });
    }
    play(ctx2) {
      let length = 0;
      const inst = this.inst;
      const vol = ctx2.createGain();
      const osc = [];
      vol.connect(ctx2.destination);
      for (let i = 0; i < this.size; i++) {
        osc[i] = ctx2.createOscillator();
        osc[i].type = inst.type;
        osc[i].connect(vol);
      }
      this.data.forEach((note) => {
        if (inst.curve) {
          vol.gain.setValueCurveAtTime(inst.curve, length, inst.getTime(note[0]));
        }
        osc.forEach((o, i) => {
          o.frequency.setValueAtTime(note[i + 1] || 0, length);
        });
        length += note[0];
      });
      osc.forEach((o) => {
        o.start();
        o.stop(length);
      });
    }
  };
  var sfx_default = {
    get ready() {
      return out !== null;
    },
    async init() {
      if (!out) {
        out = new AudioContext();
        master = out.createGain();
        master.connect(out.destination);
      }
      if (out.state === "suspended") {
        await out.resume();
      }
      const a = Math.pow(2, 1 / 12);
      for (let n = -69; n < 50; n++) {
        freq.push(Math.pow(a, n) * 440);
      }
      noise = out.createBuffer(1, bitrate * 2, bitrate);
      const output = noise.getChannelData(0);
      for (let i = 0; i < bitrate * 2; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    },
    async sound(id, sound, freq2, time2) {
      const ctx2 = new OfflineAudioContext(1, bitrate * time2, bitrate);
      const vol = ctx2.createGain();
      const curve = Float32Array.from(freq2);
      vol.connect(ctx2.destination);
      if (sound.curve) {
        vol.gain.setValueCurveAtTime(sound.curve, 0, sound.getTime(time2));
      }
      ctx2.addEventListener("complete", (e) => buffers[id] = e.renderedBuffer);
      if (sound.type == "custom") {
        const filter = ctx2.createBiquadFilter();
        filter.connect(vol);
        filter.detune.setValueCurveAtTime(curve, 0, time2);
        const src = ctx2.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        src.connect(filter);
        src.start();
      } else {
        const osc = ctx2.createOscillator();
        osc.type = sound.type;
        osc.frequency.setValueCurveAtTime(curve, 0, time2);
        osc.connect(vol);
        osc.start();
        osc.stop(time2);
      }
      await ctx2.startRendering();
    },
    async music(id, channels) {
      const length = channels.reduce((length2, channel) => channel.length > length2 ? channel.length : length2, 0);
      const ctx2 = new OfflineAudioContext(1, bitrate * length, bitrate);
      ctx2.addEventListener("complete", (e) => buffers[id] = e.renderedBuffer);
      channels.forEach((channel, i) => channel.play(ctx2));
      await ctx2.startRendering();
    },
    mixer(id) {
      if (!(id in gains)) {
        gains[id] = out.createGain();
        gains[id].connect(master);
      }
      return gains[id];
    },
    setMuted(muted2) {
      if (master) {
        master.gain.value = muted2 ? 0 : 1;
      }
    },
    suspend() {
      if (out && out.state === "running") {
        out.suspend();
      }
    },
    resume() {
      if (out && out.state === "suspended") {
        out.resume();
      }
    },
    play(id, loop = false, mixerId = "sfx") {
      if (out && id in buffers) {
        let src = out.createBufferSource();
        src.loop = loop;
        src.buffer = buffers[id];
        src.connect(this.mixer(mixerId));
        src.start();
        return src;
      }
      return null;
    }
  };

  // src/common.ts
  function $(query, element) {
    return (element || document).querySelector(query);
  }
  function on(element, event, callback, capture = false) {
    element.addEventListener(event, callback, capture);
  }
  var _Rand = class _Rand {
    static get(max = 1, min = 0, round = true) {
      if (max <= min) {
        return max;
      }
      _Rand.seed = (_Rand.seed * 9301 + 49297) % 233280;
      let value = min + _Rand.seed / 233280 * (max - min);
      return round ? Math.round(value) : value;
    }
  };
  _Rand.seed = Math.random();
  var Rand = _Rand;
  var Mode = {
    touch: false
  };

  // src/Game/Math.ts
  var Vec = class _Vec {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    get length() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    get angle() {
      return Math.atan2(this.y, this.x);
    }
    set(xOrVec, y = xOrVec) {
      if (xOrVec instanceof _Vec) {
        this.x = xOrVec.x;
        this.y = xOrVec.y;
      } else {
        this.x = xOrVec;
        this.y = y;
      }
      return this;
    }
    add(xOrVec, y = xOrVec) {
      if (xOrVec instanceof _Vec) {
        this.x += xOrVec.x;
        this.y += xOrVec.y;
      } else {
        this.x += xOrVec;
        this.y += y;
      }
      return this;
    }
    sub(xOrVec, y = xOrVec) {
      if (xOrVec instanceof _Vec) {
        this.x -= xOrVec.x;
        this.y -= xOrVec.y;
      } else {
        this.x -= xOrVec;
        this.y -= y;
      }
      return this;
    }
    scale(value) {
      this.x *= value;
      this.y *= value;
      return this;
    }
    tile(size) {
      return new _Vec(Math.floor(this.x / size), Math.floor(this.y / size));
    }
    invert() {
      this.x = -this.x;
      this.y = -this.y;
      return this;
    }
    normalize() {
      const length = this.length;
      if (length > 0) {
        this.scale(1 / length);
      }
      return this;
    }
    clone() {
      return new _Vec(this.x, this.y);
    }
  };
  var Box = class _Box {
    constructor(pos, width, height = width) {
      this.pos = pos;
      this.width = width;
      this.height = height;
      this._center = new Vec();
    }
    get center() {
      this._center.set(
        this.width / 2 + this.pos.x,
        this.height / 2 + this.pos.y
      );
      return this._center;
    }
    get bottom() {
      return this.pos.y + this.height;
    }
    collide({ pos, width, height }) {
      return this.pos.x < pos.x + width && this.pos.x + this.width > pos.x && this.pos.y < pos.y + height && this.height + this.pos.y > pos.y;
    }
    contains({ pos, width, height }) {
      return this.pos.x <= pos.x && this.pos.x + this.width >= pos.x + width && this.pos.y <= pos.y && this.pos.y + this.height >= pos.y + height;
    }
    intersect({ pos, width, height }) {
      let Ax = Math.round(this.pos.x), Ay = Math.round(this.pos.y), AX = Ax + this.width, AY = Ay + this.height, Bx = Math.round(pos.x), By = Math.round(pos.y), BX = Bx + width, BY = By + height, Cx = Ax < Bx ? Bx : Ax, Cy = Ay < By ? By : Ay, CX = AX < BX ? AX : BX, CY = AY < BY ? AY : BY;
      return new _Box(
        new Vec(Cx, Cy),
        CX - Cx,
        CY - Cy
      );
    }
  };

  // src/Game/GameEngine.ts
  var GameEvent = class {
    constructor(type, target = null, payload = null, bubble = true) {
      this.type = type;
      this.target = target;
      this.payload = payload;
      this.bubble = bubble;
      this.stoped = false;
    }
    stop() {
      this.stoped = true;
    }
  };
  var GameObject = class {
    constructor() {
      this.children = [];
      this.listeners = { all: [] };
    }
    addChild(child) {
      this.children.push(child);
      child.parent = this;
      return this;
    }
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
        child.parent = null;
      }
    }
    each(callback) {
      for (let i = this.children.length - 1; i >= 0; i--) {
        callback(this.children[i], i);
      }
    }
    on(event, listener) {
      const events = event.match(/[a-zA-Z]+/g);
      if (!events) {
        return;
      }
      events.forEach((event2) => {
        if (!(event2 in this.listeners)) {
          this.listeners[event2] = [];
        }
        this.listeners[event2].push(listener);
      });
    }
    emit(event) {
      for (const listener of this.listeners["all"]) {
        if (event.stoped) {
          return;
        }
        listener(event);
      }
      ;
      if (event.type in this.listeners) {
        for (const listener of this.listeners[event.type]) {
          if (event.stoped) {
            return;
          }
          listener(event);
        }
        ;
      }
      if (event.bubble && this.parent) {
        this.parent.emit(event);
      }
    }
    render(ctx2) {
      this.children.forEach((child) => child.render(ctx2));
    }
    update(delta) {
      this.children.forEach((child) => child.update(delta));
    }
  };
  var ObjectPool = class extends GameObject {
    constructor(factory) {
      super();
      this.factory = factory;
      this.pool = [];
    }
    create(init = null) {
      let item = this.pool.pop();
      if (!item) {
        item = this.factory();
      }
      this.addChild(item);
      if (init) {
        init(item);
      }
      return item;
    }
    removeChild(item) {
      super.removeChild(item);
      this.pool.push(item);
    }
    clear() {
      while (this.children.length) {
        this.removeChild(this.children[0]);
      }
    }
  };
  var ObjectSpawner = class extends ObjectPool {
    constructor(factory, init, box, frq = 0, limit = 0) {
      super(factory);
      this.factory = factory;
      this.init = init;
      this.box = box;
      this.frq = frq;
      this.limit = limit;
      this.pos = this.box.pos;
      this.time = 0;
    }
    create(init = null) {
      return !this.limit || this.children.length < this.limit ? super.create(init) : null;
    }
    update(delta) {
      super.update(delta);
      if (this.frq <= 0) {
        return;
      }
      this.time += delta;
      if (this.time > this.frq) {
        this.time -= this.frq;
        this.create(this.init);
      }
    }
  };

  // src/Game/Sprite.ts
  var _Sprite = class _Sprite {
    constructor() {
    }
    static load(src, config) {
      return new Promise((resolve) => {
        const image = new Image();
        on(image, "load", () => {
          _Sprite.image.push(image);
          _Sprite.config = config;
          resolve(image);
        });
        image.src = src;
      });
    }
    static tint(ctx2, r, g, b) {
      return new Promise((resolve) => {
        const canvas = ctx2.canvas;
        let image = _Sprite.image[0];
        canvas.width = image.width;
        canvas.height = image.height;
        ctx2.drawImage(_Sprite.image[0], 0, 0);
        const img = ctx2.getImageData(0, 0, canvas.width, canvas.height);
        const data = img.data;
        for (let i = 0; i < img.data.length; i += 4) {
          if (!data[i + 3]) {
            continue;
          }
          data[i] = Math.round(data[i] * r);
          data[i + 1] = Math.round(data[i + 1] * g);
          data[i + 2] = Math.round(data[i + 2] * b);
        }
        ctx2.putImageData(img, 0, 0);
        image = new Image();
        on(image, "load", () => {
          _Sprite.image.push(image);
          resolve(image);
        });
        image.src = canvas.toDataURL();
      });
    }
    static draw(ctx2, name, { pos, width, height }, frame = 0, hflip = false, vflip = false) {
      const match = name.match(/^([a-z]+)([0-9]*)$/);
      if (!match || !(match[1] in _Sprite.config)) {
        return;
      }
      const color = match[2] ? parseInt(match[2]) : 0;
      const cfg = _Sprite.config[match[1]];
      ctx2.save();
      ctx2.translate(Math.round(pos.x), Math.round(pos.y));
      ctx2.scale(hflip ? -1 : 1, vflip ? -1 : 1);
      ctx2.drawImage(
        _Sprite.image[color],
        cfg[0] + frame * width,
        cfg[1],
        width,
        height,
        hflip ? -width : 0,
        vflip ? -height : 0,
        width,
        height
      );
      ctx2.restore();
    }
  };
  _Sprite.image = [];
  var Sprite = _Sprite;

  // src/Game/Weapon.ts
  var Weapon = class extends ObjectPool {
    constructor(factory, { frq, amm, mag }) {
      super(factory);
      this.factory = factory;
      this.time = 0;
      this.frq = frq;
      this.ammo = amm;
      this.magazine = mag;
    }
    load(ammo) {
      this.ammo += ammo;
      if (this.magazine && this.ammo > this.magazine) {
        this.ammo = this.magazine;
      }
    }
    create(init = null) {
      if (this.ammo <= 0 || this.frq && this.time) {
        return null;
      }
      this.ammo--;
      this.time = this.frq;
      return super.create(init);
    }
    update(delta) {
      this.time = delta < this.time ? this.time - delta : 0;
      super.update(delta);
    }
  };
  var Bullet = class extends GameObject {
    constructor({ spd, dmg, size, color } = {}) {
      super();
      this.time = 0;
      this.spd = spd;
      this.dmg = dmg;
      this.size = size;
      this.color = color;
      this.pos = new Vec();
      this.dir = new Vec();
      this.box = new Box(this.pos, this.size);
    }
    render(ctx2) {
      let frame = Math.floor(this.time % 200 / 50);
      Sprite.draw(ctx2, "plasma" + this.color, this.box, 0, frame % 2 > 0, frame > 1);
    }
    update(delta) {
      this.time += delta;
      this.pos.add(this.dir.clone().scale(this.spd * delta));
    }
  };
  var Grenade = class extends Bullet {
    constructor({ spd, dmg, size, color, radius } = {}) {
      super({ spd, dmg, size, color });
      this.radius = radius;
      this.aim = new Vec();
    }
    render(ctx2) {
      Sprite.draw(ctx2, "grenade" + this.color, this.box);
    }
    update(delta) {
      if (this.box.center.sub(this.aim).length <= this.spd * delta) {
        this.pos.set(this.aim);
        this.emit(new GameEvent("explode", this));
        this.parent.removeChild(this);
      } else {
        super.update(delta);
      }
    }
  };

  // src/Game/Hero.ts
  var Hero = class extends GameObject {
    constructor({ hp, spd, score, lives, delay, gun, gnd } = {}) {
      super();
      this.dir = new Vec();
      this.aim = new Vec();
      this.fire = false;
      this.time = 0;
      this.resist = 0;
      this.ouch = 0;
      this.hp = hp;
      this.max = hp;
      this.spd = spd;
      this.lives = lives;
      this.delay = delay;
      this.score = score;
      this.pos = new Vec();
      this.box = new Box(this.pos, 16, 24);
      this.gun = new Weapon(() => new Bullet(gun.bul), gun);
      this.grenades = new Weapon(() => new Grenade(gnd.bul), gnd);
      this.addChild(this.grenades);
      this.addChild(this.gun);
    }
    get alive() {
      return this.lives > 0;
    }
    render(ctx2) {
      super.render(ctx2);
      if (!this.alive) {
        return;
      }
      const look = this.aim.clone().sub(this.box.center);
      let frame = look.y >= 0 ? 0 : 3, anim = this.time % 200, flip = anim < 200 / 2;
      if (Math.abs(look.x) > Math.abs(look.y)) {
        frame = anim < 200 / 2 ? 1 : 2;
        flip = look.x > 0;
      }
      let name = this.resist % 500 > 250 ? "hero" : "hero2";
      if (this.ouch > 0) {
        name = "hero6";
      }
      Sprite.draw(ctx2, name, this.box, frame, flip);
    }
    update(delta) {
      super.update(delta);
      this.resist -= delta;
      this.ouch -= delta;
      if (this.dir.length) {
        this.time += delta;
      }
      if (!this.alive || !this.fire) {
        return;
      }
      this.gun.create((bullet) => {
        const box = bullet.box;
        const center = this.box.center;
        bullet.dir.set(this.aim.clone().sub(center).normalize());
        bullet.pos.set(center.sub(box.width / 2, box.height / 2));
        this.emit(new GameEvent("fire", this, bullet));
      });
    }
    launch() {
      this.grenades.create((item) => {
        const box = item.box;
        const center = this.box.center;
        item.dir.set(this.aim.clone().sub(center).normalize());
        item.pos.set(center.sub(box.width / 2, box.height / 2));
        item.aim.set(this.aim);
        this.emit(new GameEvent("launch"));
      });
    }
    hit(hp) {
      if (this.resist > 0) {
        return;
      }
      this.hp -= hp;
      if (this.hp > 0) {
        this.ouch = 250;
        return;
      }
      if (--this.lives > 0) {
        this.hp = this.max;
        this.resist = this.delay;
        this.emit(new GameEvent("death", this));
        return;
      }
      this.hp = 0;
      this.emit(new GameEvent("lose", this));
    }
    reset() {
      this.gun.clear();
      this.grenades.clear();
    }
  };

  // src/Game/TileMap.ts
  var _TileMap = class _TileMap extends GameObject {
    constructor(level2) {
      super();
      this.level = level2;
      this.width = 14;
      this.height = 1;
      this.size = 16;
      const maps = _TileMap.MAPS;
      const map = maps[level2 % maps.length];
      let length = 0;
      this.tiles = new Array(this.width + 1).fill(0);
      for (let i = 0; i < map.length; i += 2) {
        const tile = parseInt(map.charAt(i), 36);
        const count = parseInt(map.charAt(i + 1), 36);
        for (let j = 0; j < count; j++) {
          if (length && length % 12 === 0) {
            this.tiles.push(0, 0);
            this.height++;
          }
          this.tiles.push(tile);
          length++;
        }
      }
      this.tiles.push(0);
      this.loadFrames();
    }
    get length() {
      return this.width * this.height;
    }
    get bottom() {
      return this.height * this.size;
    }
    get last() {
      return this.level >= _TileMap.MAPS.length - 1;
    }
    loadFrames() {
      this.frame = [];
      for (let y = 0; y < this.height + _TileMap.PLUS_ROWS; y++) {
        for (let x = 0; x < this.width; x++) {
          let frame = 0;
          if (this.getTile(x, y) === 0 /* WALL */) {
            frame += 1;
            if (this.getTile(x, y - 1) === 0 /* WALL */) {
              frame += 1;
            }
            if (this.getTile(x - 1, y) === 0 /* WALL */) {
              frame += 2;
            }
            if (this.getTile(x + 1, y) === 0 /* WALL */) {
              frame += 4;
            }
            if (this.getTile(x, y + 1) === 0 /* WALL */) {
              frame += 8;
            }
          }
          this.frame.push(frame);
        }
      }
    }
    render(ctx2) {
      const pos = new Vec();
      const box = new Box(pos, this.size, this.size * 1.5);
      let i = 0;
      for (let y = 0; y < this.height + _TileMap.PLUS_ROWS; y++) {
        const last = y === this.height - 1;
        for (let x = 0; x < this.width; x++) {
          const frame = this.frame[i++];
          if (!frame && !last) {
            continue;
          }
          pos.set(x, y).scale(this.size);
          Sprite.draw(ctx2, "cave1", box, frame);
        }
        pos.x += this.size;
      }
      super.render(ctx2);
    }
    setTile(x, y, tile) {
      if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
        this.tiles[y * this.width + x] = tile;
      }
    }
    getTile(x, y) {
      return y >= 0 && y < this.height && x >= 0 && x < this.width ? this.tiles[y * this.width + x] : 0 /* WALL */;
    }
    getPosByTile(tile, row = -1) {
      const start2 = row > 0 ? row : 0;
      const end = row >= 0 ? row + 1 : this.height;
      const result = [];
      let i = start2 * this.width;
      for (let y = start2; y < end; y++) {
        for (let x = 0; x < this.width; x++) {
          if (this.tiles[i++] === tile) {
            result.push(new Vec(x * this.size, y * this.size));
          }
        }
      }
      return result;
    }
    collideX({ pos, width, height }, correct = false) {
      let size = this.size, top = Math.floor(pos.y / size), left = Math.floor(pos.x / size), right = Math.floor((pos.x + width) / size);
      for (let i = top * size; i < pos.y + height; i += size) {
        let y = Math.floor(i / size);
        if (!this.getTile(left, y)) {
          if (correct) {
            pos.x += (left + 1) * size - pos.x;
          }
          return true;
        }
        if (!this.getTile(right, y)) {
          if (correct) {
            pos.x -= pos.x + width - right * size;
          }
          return true;
        }
      }
      return false;
    }
    collideY({ pos, width, height }, correct = false) {
      let size = this.size, top = Math.floor(pos.y / size), left = Math.floor(pos.x / size), bottom = Math.floor((pos.y + height) / size);
      for (let i = left * size; i < pos.x + width; i += size) {
        let x = Math.floor(i / size);
        if (!this.getTile(x, top)) {
          if (correct) {
            pos.y += (top + 1) * size - pos.y;
          }
          return true;
        }
        if (!this.getTile(x, bottom)) {
          if (correct) {
            pos.y -= pos.y + height - bottom * size;
          }
          return true;
        }
      }
      return false;
    }
    createNav(pos) {
      const target = pos.tile(this.size);
      this.nav = new Array(this.tiles.length).fill(_TileMap.MAX_NAV);
      this.setNav(target.x, target.y);
    }
    lockNav(pos) {
      const tile = pos.tile(this.size);
      this.nav[tile.y * this.width + tile.x] = _TileMap.MAX_NAV;
    }
    setDirection(item) {
      const size = this.size;
      const center = item.box.center;
      const pos = center.tile(size);
      item.dir.set(0, 0);
      let weight = _TileMap.MAX_NAV;
      weight = this.setDir(item, pos, new Vec(1, 0), weight);
      weight = this.setDir(item, pos, new Vec(-1, 0), weight);
      weight = this.setDir(item, pos, new Vec(0, 1), weight);
      weight = this.setDir(item, pos, new Vec(0, -1), weight);
      if (item.dir.x) {
        if (this.getTile(pos.x, pos.y + 1)) {
          weight = this.setDir(item, pos, new Vec(item.dir.x, 1), weight);
        }
        if (this.getTile(pos.x, pos.y - 1)) {
          weight = this.setDir(item, pos, new Vec(item.dir.x, -1), weight);
        }
      } else if (item.dir.y) {
        if (this.getTile(pos.x + 1, pos.y)) {
          weight = this.setDir(item, pos, new Vec(1, item.dir.y), weight);
        }
        if (this.getTile(pos.x - 1, pos.y)) {
          weight = this.setDir(item, pos, new Vec(-1, item.dir.y), weight);
        }
      }
      item.dir.add(pos).scale(size).add(size / 2).sub(center).normalize();
    }
    setDir(item, pos, dir, weight) {
      const nav = this.getNav(pos.x + dir.x, pos.y + dir.y);
      if (weight > nav) {
        item.dir = dir;
        weight = nav;
      }
      return weight;
    }
    getNav(x, y) {
      return y >= 0 && y < this.height && x >= 0 && x < this.width ? this.nav[y * this.width + x] : _TileMap.MAX_NAV;
    }
    setNav(x, y, weight = 0) {
      if (weight >= _TileMap.MAX_NAV || !this.getTile(x, y) || weight >= this.getNav(x, y)) {
        return;
      }
      this.nav[y * this.width + x] = weight++;
      this.setNav(x + 1, y, weight);
      this.setNav(x, y + 1, weight);
      this.setNav(x - 1, y, weight);
      this.setNav(x, y - 1, weight);
    }
  };
  _TileMap.PLUS_ROWS = 15;
  _TileMap.MAX_NAV = 30;
  _TileMap.MAPS = [
    "0316061704152113031a021a011391160219021a021a021b021b021a03184104180517061903172111031a0116011a021a0219031904180617061705180321164111011w31021831031731051631061631061632051804180314011401160213211603190319031161170312021503120215021303140114031903190319021a011a411b011a02192102190418051705193102193102193101150114310114031331150313314114031331160114311b3113711702190318042117061606150311041402120418021a011z1e581z1802192103180418041804180331180331190231190131140319033117043117053116310431163104311731033118033118023119011n211p021203150213310214021331021402133102140715021331021402133102140211611131021402133102140212031z1q211z12311a3101311831033116310531143103",
    "0316054116310414911231031931011b311r3103142112310516310516310516310517310319331t011b02125612021a0119410119310218310371173103173104311631021201311502130131150112211101311a01311a01311a0231190331180331115611033118023119321v031705150532140432150319021a021f021a02190317043112083113073114371t211r021a02126117021541140319031a031a021q32143503133108130213021502112118021a031a031s411b411b411t31011931021831031731031831021601120315021202150318041804180518041805190319041903115711021a021a011335173517327132173517351t591r081402150114021361110114021501122111051201140512011402150114021141130114021501140215011z1e211z1d321a023118043117053115071403",
    "0316051804149114021a03180517061309130411011j211f01122118021a021a0314331303133313031333140217011b011a02211u021a03150114021403190311611421130114011a031903122117021h0219041903154114011x5712011a0318041804180419041805132114041904180517061606160733120733120733120733120616031a0218711d211l011b01190319034118034115011203150212031403130213051202130513011306160716061121311405123214031333140113011133160219031a021b011d5911711o0117011303150212041402120414021304130214031302150114011t581m341731044115310541143106411331031831021931011t411z1132081232031732031732031732031261132132031732031732031732031732081j211t011404120213043112021204311302110431140631140714081305",
    "0319021921011b011591130219032118031a021a31011b31011a31021931031731041704311704311704311704311721023119011c211s0318051705170517051705170418031a0112211t581e311b321a371401391201213812013813413813413714410135150333150531150631146107140854081408140812211108140854081408140811211208140854081408122111081408140854081408140814073114310631153104311731023116711131023118310231183102311731031831021903411704411704411605170516061606211407150715071606160617051706164105411704180518041921031433120412351104123511041333120321180319021a021a0112581d41125811411z1202112112021402130314021203150614611105122111711205170616021203150213031402112112021h56130141190332143205321232063212320632123205331232410433123303331433011c",
    "0316061606129113051741041721032118310241183103311631053114310714081408140814081408140814081407311421063115053116310321183102193102193101611a311434180418041804112113211204180441180413411404173104163204143404133307123307123302173215211g411a711z125a1p3418350215350215340315330411211333041532410415320614311305133115031331126118311b01311a0131192101311a021a011b01115911011b011a04180516410516021a02126117023118033216410333150433150433140532144105311506150715071341081309130913091309130913091408170531142112043217021171311a321921311m31125612321a3419351735183418341156113301183112021a04190313211503190418041341211361041903193313411n0131135611021a023118041731041121150516310516053116043116410418041333120517061603"
  ];
  var TileMap = _TileMap;

  // src/Game/Enemy.ts
  var Enemy = class extends GameObject {
    constructor(hero2, { hp, dmg, score } = {}) {
      super();
      this.hero = hero2;
      this.pos = new Vec();
      this.box = new Box(this.pos, 16);
      this.hp = hp;
      this.max = hp;
      this.dmg = dmg;
      this.score = score;
    }
    hit(hp) {
      this.hp -= hp;
      if (this.hp > 0) {
        return;
      }
      this.emit(new GameEvent("kill", this));
      this.parent.removeChild(this);
      this.hp = this.max;
    }
  };
  var EnemyCamper = class extends Enemy {
    render(ctx2) {
      Sprite.draw(ctx2, "camp6", this.box);
    }
    update(delta) {
      super.update(delta);
      for (const bullet of this.hero.gun.children) {
        if (this.box.collide(bullet.box)) {
          this.emit(new GameEvent("hit", this, bullet.dmg));
          bullet.parent.removeChild(bullet);
          return;
        }
      }
      if (this.box.collide(this.hero.box)) {
        this.emit(new GameEvent("hit", this.hero, this.dmg));
        this.emit(new GameEvent("kill", this));
        this.parent.removeChild(this);
        return;
      }
    }
  };
  var EnemyWorm = class extends Enemy {
    constructor(hero2, { hp, dmg, score, spd, frq } = {}) {
      super(hero2, { hp, dmg, score });
      this.hero = hero2;
      this.time = 0;
      this.frame = 0;
      this.hitFrame = 0;
      this.active = true;
      this.spd = spd;
      this.frq = frq;
    }
    render(ctx2) {
      if (this.active) {
        const frame = Math.abs(this.frame % 5 - 2);
        Sprite.draw(ctx2, "worm1", this.box, frame);
      }
    }
    update(delta) {
      super.update(delta);
      this.time += delta;
      this.frame = Math.floor(this.time % this.frq / this.spd);
      this.active = this.frame < 5;
      if (!this.active || this.frame === this.hitFrame) {
        return;
      }
      if (this.box.collide(this.hero.box)) {
        this.hitFrame = this.frame;
        this.emit(new GameEvent("hit", this.hero, this.dmg));
        return;
      }
    }
  };
  var EnemyShooter = class extends EnemyCamper {
    constructor(hero2, { hp, dmg, score, near, far, gun } = {}) {
      super(hero2, { hp, dmg, score });
      this.hero = hero2;
      this.active = false;
      this.near = near;
      this.far = far;
      this.gun = new Weapon(() => new Bullet(gun.bul), gun);
      this.addChild(this.gun);
    }
    render(ctx2) {
      Sprite.draw(ctx2, "shot1", this.box);
      this.gun.render(ctx2);
    }
    update(delta) {
      super.update(delta);
      const hero2 = this.hero;
      this.gun.each((bullet) => {
        if (bullet.box.collide(hero2.box)) {
          this.emit(new GameEvent("hit", hero2, bullet.dmg));
          bullet.parent.removeChild(bullet);
        }
      });
      const center = this.box.center;
      const diff = hero2.box.center.sub(center);
      const distance = diff.length;
      this.active = this.active && distance < this.far || !this.active && distance < this.near && hero2.box.bottom > this.pos.y;
      if (!this.active) {
        return;
      }
      this.gun.create((bullet) => {
        const box = bullet.box;
        bullet.dir.set(diff.normalize());
        bullet.pos.set(center.sub(box.width / 2, box.height / 2));
        this.emit(new GameEvent("eject", bullet));
      });
    }
  };
  var EnemyRunner = class extends EnemyCamper {
    constructor(hero2, { hp, dmg, score, far, gun, spd } = {}) {
      super(hero2, { hp, dmg, score, far, gun });
      this.hero = hero2;
      this.dir = new Vec();
      this.time = 0;
      this.spd = spd;
    }
    render(ctx2) {
      let frame = Math.floor(this.time % 400 / 100);
      Sprite.draw(ctx2, "runner5", this.box, frame > 1 ? 3 - frame : frame, frame > 1);
    }
    update(delta) {
      super.update(delta);
      this.time += delta;
    }
  };
  var EnemySpawner = class extends ObjectSpawner {
    constructor(factory, init, box, { frq, limit, near, far }) {
      super(factory, init, box, frq, limit);
      this.factory = factory;
      this.init = init;
      this.box = box;
      this.active = false;
      this.near = near;
      this.far = far;
    }
    create(init = null) {
      return this.active ? super.create(init) : null;
    }
    toggle(pos) {
      const distance = this.box.center.sub(pos).length;
      if (distance > this.far) {
        this.active = false;
      } else if (!this.active && pos.y > this.box.center.y && distance < this.near) {
        this.active = true;
        this.emit(new GameEvent("spawn", this));
      }
    }
    render(ctx2) {
      Sprite.draw(ctx2, "hole1", this.box);
      super.render(ctx2);
    }
  };

  // src/Game/Txt.ts
  var Txt = class extends GameObject {
    constructor(pos, _text = "", width = 6, height = 8) {
      super();
      this.pos = pos;
      this._text = _text;
      this.width = width;
      this.height = height;
      this.box = new Box(pos, this._text.length * width, height);
    }
    set text(value) {
      this._text = value;
      this.box.width = value.length * this.width;
    }
    render(ctx2) {
      const box = new Box(this.pos.clone(), this.width, this.height);
      for (let i = 0; i < this._text.length; i++) {
        let char = this._text.charCodeAt(i);
        if (char < 32) {
          box.pos.y += this.height;
          box.pos.x = this.pos.x;
          continue;
        } else if (char >= 48 && char <= 57) {
          char -= 48;
        } else if (char >= 97 && char <= 122) {
          char -= 87;
        } else if (char >= 65 && char <= 90) {
          char -= 55;
        } else if (char === 44) {
          char = 37;
        } else if (char === 46) {
          char = 36;
        } else {
          box.pos.x += this.width;
          continue;
        }
        Sprite.draw(ctx2, "font", box, char);
        box.pos.x += this.width;
      }
    }
  };

  // src/Game/Hud.ts
  var Hud = class extends GameObject {
    constructor(hero2, cam, map) {
      super();
      this.hero = hero2;
      this.cam = cam;
      this.satus = 0 /* start */;
      this.text = new Txt(new Vec(3));
      this.message = new Txt(new Vec(32, 120));
      this.messages = [
        "",
        "",
        "Game Over",
        map.last ? "The End" : `Level ${map.level + 1} Complete`
      ];
      this.addChild(this.text).addChild(this.message);
      this.update(0);
    }
    update(delta) {
      const box1 = this.cam.box;
      const box2 = this.message.box;
      const hero2 = this.hero;
      const hp = new String(hero2.hp + 1e3).substr(1);
      const ammo = new String(hero2.grenades.ammo + 100).substr(1);
      const score = new String(hero2.score + 1e6).substr(1);
      this.text.text = `MEN ${hero2.lives}  HP ${hp}  BOMB ${ammo}  SCORE ${score}`;
      this.message.pos.set((box1.width - box2.width) / 2, (box1.height - box2.height) / 2);
      this.message.text = this.satus === 0 /* start */ ? Mode.touch ? "Tap to Start" : "Click to Start" : this.messages[this.satus];
    }
    render(ctx2) {
      if (this.message.box.width > 0 && this.satus !== 1 /* run */) {
        const box = this.message.box;
        ctx2.fillStyle = "rgba(0, 0, 0, .65)";
        ctx2.fillRect(0, Math.round(box.pos.y) - 8, this.cam.box.width, box.height + 16);
      }
      super.render(ctx2);
    }
  };

  // src/Game/Item.ts
  var Item = class extends GameObject {
    constructor(hero2, value, frame, color) {
      super();
      this.hero = hero2;
      this.value = value;
      this.frame = frame;
      this.color = color;
      this.pos = new Vec();
      this.box = new Box(this.pos, 16);
    }
    render(ctx2) {
      Sprite.draw(ctx2, "item" + this.color, this.box, this.frame);
    }
    update(delta) {
      if (this.box.collide(this.hero.box)) {
        this.power();
        this.emit(new GameEvent("item", this));
        this.parent.removeChild(this);
      }
    }
  };
  var Medkit = class extends Item {
    power() {
      const hero2 = this.hero;
      hero2.hp += this.value;
      if (hero2.hp > hero2.max) {
        hero2.hp = hero2.max;
      }
    }
  };
  var AmmoBox = class extends Item {
    power() {
      this.hero.grenades.load(this.value);
    }
  };

  // src/config.ts
  var config_default = {
    cam: {
      width: 224,
      height: 256,
      spd: 0.02
    },
    hero: {
      hp: 100,
      spd: 0.07,
      score: 0,
      lives: 3,
      delay: 3e3,
      gun: {
        frq: 80,
        amm: 99999,
        mag: 0,
        bul: {
          spd: 0.4,
          dmg: 25,
          size: 6,
          color: 4
        }
      },
      gnd: {
        frq: 500,
        amm: 5,
        mag: 10,
        bul: {
          spd: 0.2,
          dmg: 150,
          size: 10,
          color: 2,
          radius: 48
        }
      }
    },
    camp: {
      hp: 20,
      dmg: 5,
      score: 10
    },
    shot: {
      hp: 150,
      dmg: 0,
      score: 50,
      near: 96,
      far: 160,
      gun: {
        frq: 800,
        amm: 9999,
        mag: 0,
        bul: {
          spd: 0.1,
          dmg: 10,
          size: 6,
          color: 3
        }
      }
    },
    worm: {
      hp: 500,
      dmg: 2,
      score: 95,
      spd: 100,
      frq: 2500
    },
    hole: {
      frq: 300,
      limit: 20,
      near: 180,
      far: 320
    },
    runr: {
      hp: 10,
      dmg: 10,
      spd: 0.07,
      score: 25
    }
  };

  // src/Game/Explosion.ts
  var Explosion = class extends GameObject {
    constructor() {
      super(...arguments);
      this.pos = new Vec();
      this.box = new Box(this.pos, 16);
      this.time = 0;
      this.flip = false;
      this.frame = 0;
    }
    render(ctx2) {
      Sprite.draw(ctx2, "splash3", this.box, this.frame, this.flip);
    }
    update(delta) {
      super.update(delta);
      this.time += delta;
      this.frame = Math.floor(this.time / 100);
      if (this.frame > 2) {
        this.parent.removeChild(this);
      }
    }
  };

  // src/Game/Camera.ts
  var Camera = class extends GameObject {
    constructor(hero2, { width, height, spd }, bottom) {
      super();
      this.hero = hero2;
      this.bottom = bottom;
      this.move = true;
      this.pos = new Vec();
      this.box = new Box(this.pos, width, height);
      this.spd = spd;
    }
    update(delta) {
      const hero2 = this.hero;
      if (hero2.alive && hero2.box.bottom <= this.pos.y) {
        hero2.hit(100);
      }
      this.pos.y += this.spd * delta;
    }
  };

  // src/Game/GameScene.ts
  var GameScene = class extends GameObject {
    constructor(hero2, map) {
      super();
      this.hero = hero2;
      this.map = map;
      this.cam = new Camera(this.hero, config_default.cam, this.map.bottom);
      this.hud = new Hud(this.hero, this.cam, this.map);
      this.aim = new Vec();
      this.holes = [];
      this.camps = new ObjectPool(() => new EnemyCamper(this.hero, config_default.camp));
      this.shots = new ObjectPool(() => new EnemyShooter(this.hero, config_default.shot));
      this.worms = new ObjectPool(() => new EnemyWorm(this.hero, config_default.worm));
      this.explos = new ObjectPool(() => new Explosion());
      this.onHit = (event) => {
        const target = event.target;
        if (target instanceof Enemy) {
          target.hit(event.payload);
        }
        if (target instanceof Hero) {
          target.hit(event.payload);
        }
      };
      this.onKill = (event) => {
        const target = event.target;
        this.hero.score += target.score;
        this.createExplo(target.pos);
      };
      this.onDeath = (event) => {
        const hero2 = event.target;
        const pos = hero2.pos.clone();
        this.createExplo(pos);
        this.createExplo(pos.add(0, 8));
        this.revive(hero2);
      };
      this.onExplode = (event) => {
        const grenade = event.target;
        this.camps.each((enemy) => this.explode(grenade, enemy));
        this.shots.each((enemy) => this.explode(grenade, enemy));
        for (const spawner of this.holes) {
          spawner.each((enemy) => this.explode(grenade, enemy));
        }
      };
      this.map.createNav(this.hero.box.center);
      this.addChild(this.cam).addChild(this.map).addChild(this.worms).addChild(this.camps).addChild(this.shots);
      for (const pos of this.map.getPosByTile(9 /* HERO */)) {
        this.hero.pos.set(pos);
      }
      for (const pos of this.map.getPosByTile(3 /* CAMP */)) {
        this.camps.create((item) => item.pos.set(pos));
      }
      for (const pos of this.map.getPosByTile(4 /* SHOT */)) {
        this.shots.create((item) => item.pos.set(pos));
      }
      for (const pos of this.map.getPosByTile(5 /* WORM */)) {
        this.worms.create((item) => {
          item.time = pos.x * 6;
          item.pos.set(pos);
        });
      }
      for (const pos of this.map.getPosByTile(6 /* HEAL */)) {
        let item = new Medkit(this.hero, 100, 0, 0);
        item.pos.set(pos);
        this.addChild(item);
      }
      for (const pos of this.map.getPosByTile(7 /* AMMO */)) {
        let item = new AmmoBox(this.hero, 100, 1, 2);
        item.pos.set(pos);
        this.addChild(item);
      }
      for (const pos of this.map.getPosByTile(2 /* HOLE */)) {
        const hole = new EnemySpawner(
          () => new EnemyRunner(this.hero, config_default.runr),
          (item) => item.pos.set(pos),
          new Box(pos, 16, 16),
          config_default.hole
        );
        this.holes.push(hole);
        this.addChild(hole);
      }
      this.addChild(this.hero).addChild(this.explos);
      this.bind();
    }
    bind() {
      this.on("all", (event) => sfx_default.play(event.type));
      this.on("hit", this.onHit);
      this.on("kill", this.onKill);
      this.on("death", this.onDeath);
      this.on("explode", this.onExplode);
      this.on("lose", (event) => {
        this.hud.satus = 2 /* lose */;
      });
      this.on("win", (event) => {
        this.hud.satus = 3 /* win */;
      });
    }
    revive(hero2) {
      const map = this.map;
      let row = Math.floor(this.cam.box.bottom / map.size);
      if (row >= map.height) {
        row = map.height - 1;
      }
      const pos = map.getPosByTile(1 /* GROUND */, row);
      const i = pos.length > 1 ? Rand.get(pos.length - 1) : 0;
      hero2.hp = hero2.max;
      hero2.pos.set(pos[i]);
    }
    explode(grenade, item) {
      const center = grenade.box.center;
      const dist = item.box.center.sub(center).length;
      this.createExplo(grenade.pos);
      if (grenade.radius >= dist) {
        this.emit(new GameEvent("hit", item, grenade.dmg));
      }
    }
    createExplo(pos) {
      this.explos.create((item) => {
        item.pos.set(pos);
        item.time = 0;
        item.flip = Math.random() < 0.5;
        item.frame = 0;
      });
    }
    render(ctx2) {
      ctx2.save();
      ctx2.clearRect(0, 0, ctx2.canvas.width, ctx2.canvas.height);
      ctx2.translate(0, -Math.round(this.cam.pos.y));
      super.render(ctx2);
      ctx2.restore();
      this.hud.render(ctx2);
    }
    update(delta) {
      this.hud.update(delta);
      if (this.hud.satus !== 1 /* run */) {
        return;
      }
      super.update(delta);
      this.updateProjectile(delta);
      this.updateHero(delta);
      this.updateMap();
      this.updateSpawners(delta);
    }
    updateHero(delta) {
      const hero2 = this.hero;
      const map = this.map;
      const cam = this.cam;
      const bottom = cam.box.bottom - hero2.box.bottom;
      if (hero2.dir.x) {
        hero2.pos.x += hero2.dir.x * hero2.spd * delta;
        map.collideX(hero2.box, true);
      }
      if (hero2.dir.y && (hero2.dir.y < 0 || bottom > 0)) {
        hero2.pos.y += hero2.dir.y * hero2.spd * delta;
        map.collideY(hero2.box, true);
      }
      if (hero2.box.bottom >= map.bottom) {
        hero2.emit(new GameEvent("win", hero2));
      }
      hero2.aim.set(this.aim).add(-cam.pos.x, cam.pos.y);
    }
    updateProjectile(delta) {
      this.hero.gun.each((item) => {
        if (this.map.collideX(item.box) || this.map.collideY(item.box)) {
          item.parent.removeChild(item);
        }
      });
      this.hero.grenades.each((item) => {
        if (this.map.collideX(item.box) || this.map.collideY(item.box)) {
          item.emit(new GameEvent("explode", item));
          item.parent.removeChild(item);
        }
      });
      this.shots.each((enemy) => {
        enemy.gun.each((item) => {
          if (this.map.collideX(item.box) || this.map.collideY(item.box)) {
            item.parent.removeChild(item);
          }
        });
      });
    }
    updateMap() {
      this.map.createNav(this.hero.box.center);
      for (const spawner of this.holes) {
        for (const item of spawner.children) {
          this.map.lockNav(item.box.center);
        }
      }
    }
    updateSpawners(delta) {
      for (const spawner of this.holes) {
        spawner.toggle(this.hero.pos);
        for (const item of spawner.children) {
          this.map.setDirection(item);
          const speed = item.spd * delta;
          item.pos.add(item.dir.x * speed, item.dir.y * speed);
        }
      }
    }
    pointer(x, y) {
      this.aim.set(x, y);
    }
    input(keys3, down) {
      let x = 0;
      let y = 0;
      if (keys3["KeyA" /* LEFT */]) {
        x -= 1;
      }
      if (keys3["KeyD" /* RIGHT */]) {
        x += 1;
      }
      if (keys3["KeyW" /* UP */]) {
        y -= 1;
      }
      if (keys3["KeyS" /* DOWN */]) {
        y += 1;
      }
      this.hero.dir.set(x, y).normalize();
      this.hero.fire = keys3[0 /* FIRE */] === true;
      if (keys3[2 /* ALT */] && down) {
        this.hero.launch();
      }
    }
  };

  // src/Game/IntroScene.ts
  var IntroScene = class extends GameObject {
    constructor() {
      super();
      this.title = new Txt(new Vec(32, 24), "F a l l  B a c k  H e r o");
      this.story = new Txt(
        new Vec(6, 56),
        "In 2091 a meteor landed on Earth,\nand an alien lifeform arrived with\nit. Not far from the impact site,\nthe creatures settled in a cave.\n\nAn elite squad of 3 men has been\nsent into the cave to secure the\narea for further research.\n\nBut then suddenly..."
      );
      this.help = new Txt(new Vec(8, 172), "");
      this.hint = new Txt(new Vec(72, 220), "");
      this.addChild(this.title).addChild(this.story).addChild(this.help).addChild(this.hint);
    }
    render(ctx2) {
      ctx2.save();
      ctx2.fillStyle = "#000";
      ctx2.fillRect(0, 0, ctx2.canvas.width, ctx2.canvas.height);
      if (Mode.touch) {
        this.help.text = "  Move     Aim, fire    Bomb\n\nLeft pad   Right pad   Button";
        this.hint.text = "Tap to start";
        this.help.pos.x = 25;
      } else {
        this.help.text = " Move        Fire         Bomb\n\nW A S D   Left Click   Right Click";
        this.hint.text = "Click to start";
        this.help.pos.x = 8;
      }
      this.hint.pos.x = Math.round((ctx2.canvas.width - this.hint.box.width) / 2);
      super.render(ctx2);
      ctx2.restore();
    }
    pointer(x, y) {
    }
    input(keys3, down) {
    }
  };

  // src/assets/texture.json
  var texture_default = {
    cave: [0, 0],
    hero: [0, 24],
    font: [0, 48],
    item: [64, 24],
    splash: [112, 24],
    worm: [160, 24],
    runner: [208, 24],
    plasma: [64, 40],
    camp: [231, 40],
    hole: [240, 24],
    shot: [247, 40],
    grenade: [256, 24]
  };

  // src/assets/texture.png
  var texture_default2 = "data:image/png;base64,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";

  // src/main.ts
  /*!
   * Fall Back Hero
   * Original game (js13kGames 2019): game & level design by Tayrassin,
   * music by Gotshi, development by Tricsi. MIT License.
   *
   * PewPlay edition: responsive full-window layout, crisp scaling,
   * twin-stick touch controls, on-screen mute button, pause when hidden.
   */
  var STORE = "fall-back-hero:";
  var GW = config_default.cam.width;
  var GH = config_default.cam.height;
  var buffer = document.createElement("canvas");
  var ctx = buffer.getContext("2d", { willReadFrequently: true });
  var screen = $("#game");
  var sctx = screen.getContext("2d");
  var touchLayer = $("#touch");
  var soundBtn = $("#sound");
  var bombBtn = $("#bomb");
  var keys2 = {};
  var level = 0;
  var hero = new Hero(config_default.hero);
  var intro = new IntroScene();
  var scene = new GameScene(hero, new TileMap(level));
  var time = performance.now();
  var running = false;
  var loaded = false;
  var music = null;
  var musicOn = true;
  var muted = false;
  var lastStatus = -1;
  var statusTime = 0;
  var volume = 0.2;
  var view = { x: 0, y: 0, w: GW, h: GH, scale: 1, layout: "none" };
  var mouse = { fire: false, active: false };
  var STICK_RADIUS = 46;
  var moveStick = makeStick("#stick-move");
  var aimStick = makeStick("#stick-aim");
  var direct = { id: -1, x: 0, y: 0 };
  var lastAim = { x: 0, y: 1 };
  function makeStick(sel) {
    const el = $(sel);
    return { id: -1, ox: 0, oy: 0, x: 0, y: 0, rest: { x: 0, y: 0 }, el, knob: $(".knob", el) };
  }
  function load(key) {
    try {
      return localStorage.getItem(STORE + key);
    } catch (e) {
      return null;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(STORE + key, value);
    } catch (e) {
    }
  }
  function setTouchMode(touch) {
    if (Mode.touch === touch) {
      return;
    }
    Mode.touch = touch;
    document.body.classList.toggle("touch", touch);
    layout();
  }
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }
  function layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    let ax = 0, ay = 0, aw = W, ah = H;
    view.layout = "none";
    if (Mode.touch) {
      const bottom = clamp(Math.round(H * 0.3), 170, 280);
      const side = clamp(Math.round(W * 0.18), 130, 230);
      const sBottom = Math.min(W / GW, (H - bottom) / GH);
      const sSide = Math.min((W - side * 2) / GW, H / GH);
      if (sBottom >= sSide) {
        view.layout = "bottom";
        ah = H - bottom;
      } else {
        view.layout = "sides";
        ax = side;
        aw = W - side * 2;
      }
    }
    const scale = Math.max(0.1, Math.min(aw / GW, ah / GH));
    view.scale = scale;
    view.w = Math.round(GW * scale);
    view.h = Math.round(GH * scale);
    view.x = Math.round(ax + (aw - view.w) / 2);
    view.y = Math.round(ay + (ah - view.h) / 2);
    if (view.layout === "bottom") {
      view.y = 0;
    }
    const dpr = window.devicePixelRatio || 1;
    screen.style.left = view.x + "px";
    screen.style.top = view.y + "px";
    screen.style.width = view.w + "px";
    screen.style.height = view.h + "px";
    screen.width = Math.max(1, Math.round(view.w * dpr));
    screen.height = Math.max(1, Math.round(view.h * dpr));
    if (view.layout === "bottom") {
      const top = view.y + view.h;
      const cy = top + (H - top) / 2;
      moveStick.rest = { x: W * 0.22, y: cy + 8 };
      aimStick.rest = { x: W * 0.78, y: cy + 8 };
      place(bombBtn, W / 2, cy - 22);
      soundBtn.style.left = W / 2 - 22 + "px";
      soundBtn.style.top = H - 52 + "px";
      soundBtn.style.right = "auto";
    } else if (view.layout === "sides") {
      const lx = view.x / 2;
      const rx = W - lx;
      moveStick.rest = { x: lx, y: H * 0.62 };
      aimStick.rest = { x: rx, y: H * 0.66 };
      place(bombBtn, rx, H * 0.28);
      soundBtn.style.left = lx - 22 + "px";
      soundBtn.style.top = "10px";
      soundBtn.style.right = "auto";
    } else {
      soundBtn.style.left = "auto";
      soundBtn.style.top = "10px";
      soundBtn.style.right = "10px";
    }
    for (const stick of [moveStick, aimStick]) {
      if (stick.id < 0) {
        showStick(stick, stick.rest.x, stick.rest.y, 0, 0);
      }
    }
    draw();
  }
  function place(el, x, y) {
    el.style.left = Math.round(x - el.offsetWidth / 2) + "px";
    el.style.top = Math.round(y - el.offsetHeight / 2) + "px";
  }
  function showStick(stick, ox, oy, dx, dy) {
    stick.el.style.transform = `translate(${Math.round(ox)}px, ${Math.round(oy)}px)`;
    stick.knob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    stick.el.classList.toggle("active", stick.id >= 0);
  }
  function toGame(clientX, clientY) {
    return {
      x: (clientX - view.x) / view.w * GW,
      y: (clientY - view.y) / view.h * GH
    };
  }
  function onPicture(x, y) {
    return x >= view.x && x <= view.x + view.w && y >= view.y && y <= view.y + view.h;
  }
  function stickVec(stick) {
    let dx = (stick.x - stick.ox) / STICK_RADIUS;
    let dy = (stick.y - stick.oy) / STICK_RADIUS;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    return { x: dx, y: dy, len: len > 1 ? 1 : len };
  }
  function advance() {
    if (performance.now() - statusTime < 700) {
      return;
    }
    if (!running) {
      if (!loaded) {
        return;
      }
      running = true;
      unlockAudio();
    }
    switch (scene.hud.satus) {
      case 1 /* run */:
        break;
      case 0 /* start */:
        scene.hud.satus = 1 /* run */;
        break;
      case 3 /* win */:
        if (++level < TileMap.MAPS.length) {
          hero.reset();
          scene = new GameScene(hero, new TileMap(level));
          break;
        }
      default:
        level = 0;
        hero = new Hero(config_default.hero);
        scene = new GameScene(hero, new TileMap(level));
        break;
    }
  }
  function bomb() {
    if (running && scene.hud.satus === 1 /* run */) {
      scene.hero.launch();
    }
  }
  function applyInput() {
    const hero2 = scene.hero;
    const cam = scene.cam;
    let x = 0, y = 0;
    if (keys2.KeyA || keys2.ArrowLeft) x -= 1;
    if (keys2.KeyD || keys2.ArrowRight) x += 1;
    if (keys2.KeyW || keys2.ArrowUp) y -= 1;
    if (keys2.KeyS || keys2.ArrowDown) y += 1;
    hero2.dir.set(x, y).normalize();
    if (moveStick.id >= 0) {
      const v = stickVec(moveStick);
      if (v.len > 0.18) {
        const m = Math.min(1, v.len / 0.6) / v.len;
        hero2.dir.set(v.x * m, v.y * m);
      }
    }
    let fire = mouse.fire;
    const cx = hero2.box.center.x - cam.pos.x;
    const cy = hero2.box.center.y - cam.pos.y;
    if (aimStick.id >= 0) {
      const v = stickVec(aimStick);
      if (v.len > 0.3) {
        lastAim.x = v.x / v.len;
        lastAim.y = v.y / v.len;
        fire = true;
      }
    }
    if (direct.id >= 0) {
      const p = toGame(direct.x, direct.y);
      scene.pointer(p.x, p.y);
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) {
        lastAim.x = dx / d;
        lastAim.y = dy / d;
      }
      fire = true;
    } else if (Mode.touch && !mouse.active) {
      scene.pointer(cx + lastAim.x * 64, cy + lastAim.y * 64);
    }
    hero2.fire = fire;
  }
  function update() {
    requestAnimationFrame(update);
    const now = performance.now();
    const delta = now - time;
    time = now;
    if (!loaded || document.hidden) {
      return;
    }
    if (!running) {
      intro.update(delta);
      intro.render(ctx);
    } else {
      applyInput();
      scene.update(delta < 34 ? delta : 34);
      scene.render(ctx);
      if (scene.hud.satus !== lastStatus) {
        lastStatus = scene.hud.satus;
        if (lastStatus === 3 /* win */ || lastStatus === 2 /* lose */) {
          statusTime = now;
        }
      }
    }
    draw();
  }
  function draw() {
    if (!loaded) {
      return;
    }
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = "#c96";
    sctx.fillRect(0, 0, screen.width, screen.height);
    sctx.drawImage(buffer, 0, 0, GW, GH, 0, 0, screen.width, screen.height);
  }
  function refreshSound() {
    soundBtn.classList.toggle("muted", muted);
    soundBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    soundBtn.title = muted ? "Unmute sound (M)" : "Mute sound (M)";
    sfx_default.setMuted(muted);
  }
  function toggleMute() {
    muted = !muted;
    save("muted", muted ? "1" : "0");
    refreshSound();
  }
  function toggleMusic() {
    musicOn = !musicOn;
    if (music) {
      sfx_default.mixer("music").gain.value = musicOn ? volume : 0;
    }
  }
  var audioStarted = false;
  function unlockAudio() {
    if (!running || audioStarted) {
      return;
    }
    if (navigator.userActivation && !navigator.userActivation.isActive) {
      return;
    }
    audioStarted = true;
    initAudio();
  }
  async function initAudio() {
    await sfx_default.init();
    refreshSound();
    await Promise.all([
      sfx_default.sound("hit", new Sound("custom", [2, 1, 0], 1), [110, 0], 0.2),
      sfx_default.sound("fire", new Sound("square", [0.2, 0.1, 0], 0.2), [660, 110], 0.1),
      sfx_default.sound("eject", new Sound("triangle", [0.2, 0.1, 0], 0.2), [220, 0], 0.1),
      sfx_default.sound("launch", new Sound("custom", [1, 0.5, 0], 1), [880, 0], 0.1),
      sfx_default.sound("explode", new Sound("custom", [5, 1, 0], 1), [220, 0], 1),
      sfx_default.sound("item", new Sound("square", [0.3, 0.1, 0], 1), [220, 440, 220, 440, 220, 440, 220, 440], 0.3),
      sfx_default.music("music", [
        new Channel(new Sound("sawtooth", [0.2, 0.2], 0.2), "2c5eb5g5,1f4ab4c5,1g4bb4d5,2c5eb5g5,1f4ab4c5,1bb4d5ff5|3|", 1),
        new Channel(new Sound("square", [1, 0.3], 0.2), "2c4,2c4,1c3,2c4,3ab3,2ab3,2ab2,2ab3,2f2,2f2,2g3,2g2,2bb2,2bb3,2g2,2g3,2c4,2c4,1c3,2c4,3ab3,2ab3,2ab2,2ab3,1f2,1f3,1f2,1f3,2g3,2g2,1bb2,1,2bb3,2g2,2g3|3|", 0.125),
        new Channel(new Sound("square", [0.5, 0.5], 1), "2,2c5,2eb5,1g5,2d5,3c5,4ab4,2,2f4,2g4,1f4,2bb4,1eb4,2g4,2b4,2g4,2,2c5,2eb5,1g5,2d5,3c5,4ab4,2,2g5,3bb5,3eb6,2d6,2bb5,2c6,2,2c5,2eb5,1g5,2d5,3c5,4ab4,2,2f4,2g4,1f4,2bb4,1eb4,2g4,2b4,2g4,2,2c5,2eb5,1g5,2d5,3c5,4ab4,2,.5g5,.5bb5,.5c6,.5eb6,2f6,1b5,3eb6,1d6,1d5,1c6,1c5,2bb5", 0.125)
      ])
    ]);
    sfx_default.mixer("music").gain.value = musicOn ? volume : 0;
    music = sfx_default.play("music", true, "music");
  }
  function bind() {
    on(document, "keydown", (e) => {
      keys2[e.code] = true;
      unlockAudio();
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) {
          toggleMusic();
        }
      } else if (e.code === "KeyM" && !e.repeat) {
        toggleMute();
      } else if (e.code.indexOf("Arrow") === 0) {
        e.preventDefault();
      }
    });
    on(document, "keyup", (e) => {
      keys2[e.code] = false;
    });
    on(window, "blur", () => {
      for (const k in keys2) keys2[k] = false;
      mouse.fire = false;
    });
    on(document, "pointerdown", (e) => {
      if (e.target === soundBtn || e.target === bombBtn) {
        return;
      }
      e.preventDefault();
      if (e.pointerType === "mouse") {
        setTouchMode(false);
        mouse.active = true;
        const p = toGame(e.clientX, e.clientY);
        scene.pointer(p.x, p.y);
        if (e.button === 0) {
          mouse.fire = true;
        } else if (e.button === 2) {
          bomb();
        }
        advance();
        return;
      }
      setTouchMode(true);
      mouse.active = false;
      const x = e.clientX, y = e.clientY;
      let stick = null;
      if (onPicture(x, y)) {
        if (direct.id < 0) {
          direct.id = e.pointerId;
          direct.x = x;
          direct.y = y;
        }
      } else {
        stick = x < window.innerWidth / 2 ? moveStick : aimStick;
        if (stick.id < 0) {
          stick.id = e.pointerId;
          stick.ox = stick.x = x;
          stick.oy = stick.y = y;
          showStick(stick, x, y, 0, 0);
        }
      }
      advance();
    }, { passive: false });
    on(document, "pointermove", (e) => {
      if (e.pointerType === "mouse") {
        const p = toGame(e.clientX, e.clientY);
        scene.pointer(p.x, p.y);
        mouse.active = true;
        return;
      }
      if (e.pointerId === direct.id) {
        direct.x = e.clientX;
        direct.y = e.clientY;
      }
      for (const stick of [moveStick, aimStick]) {
        if (e.pointerId === stick.id) {
          stick.x = e.clientX;
          stick.y = e.clientY;
          const v = stickVec(stick);
          showStick(stick, stick.ox, stick.oy, v.x * STICK_RADIUS, v.y * STICK_RADIUS);
        }
      }
    });
    const release = (e) => {
      if (e.pointerType === "mouse") {
        if (e.button === 0 || e.type === "pointercancel") {
          mouse.fire = false;
        }
        return;
      }
      if (e.pointerId === direct.id) {
        direct.id = -1;
      }
      for (const stick of [moveStick, aimStick]) {
        if (e.pointerId === stick.id) {
          stick.id = -1;
          showStick(stick, stick.rest.x, stick.rest.y, 0, 0);
        }
      }
    };
    on(document, "pointerup", release);
    on(document, "pointerup", unlockAudio, true);
    on(document, "click", unlockAudio, true);
    on(document, "pointercancel", release);
    on(bombBtn, "pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setTouchMode(e.pointerType !== "mouse");
      bombBtn.classList.add("pressed");
      if (!running || scene.hud.satus !== 1 /* run */) {
        advance();
      } else {
        bomb();
      }
    });
    const unpress = () => bombBtn.classList.remove("pressed");
    on(bombBtn, "pointerup", unpress);
    on(bombBtn, "pointercancel", unpress);
    on(bombBtn, "pointerleave", unpress);
    on(soundBtn, "pointerdown", (e) => e.stopPropagation());
    on(soundBtn, "click", (e) => {
      e.preventDefault();
      toggleMute();
      soundBtn.blur();
    });
    on(document, "contextmenu", (e) => e.preventDefault());
    on(document, "selectstart", (e) => e.preventDefault());
    on(window, "resize", layout);
    on(window, "orientationchange", () => setTimeout(layout, 100));
    on(document, "visibilitychange", () => {
      if (document.hidden) {
        sfx_default.suspend();
        mouse.fire = false;
      } else {
        time = performance.now();
        sfx_default.resume();
      }
    });
  }
  async function start() {
    muted = load("muted") === "1";
    refreshSound();
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    setTouchMode(!!coarse || navigator.maxTouchPoints > 0 && !window.matchMedia("(pointer: fine)").matches);
    bind();
    layout();
    await Sprite.load(texture_default2, texture_default);
    await Sprite.tint(ctx, 0.8, 0.3, 0.1);
    await Sprite.tint(ctx, 0.4, 0.9, 0.4);
    await Sprite.tint(ctx, 1, 0.7, 0);
    await Sprite.tint(ctx, 0.1, 1, 1);
    await Sprite.tint(ctx, 0.8, 0.1, 1);
    await Sprite.tint(ctx, 1, 0.2, 0.2);
    buffer.width = GW;
    buffer.height = GH;
    loaded = true;
    document.body.classList.add("ready");
    layout();
    time = performance.now();
    update();
  }
  if (document.readyState === "complete") {
    start();
  } else {
    on(window, "load", start);
  }
})();
