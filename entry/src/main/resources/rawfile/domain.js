(function (root) {
  'use strict';
  const venues = [
    { id: 'zgc', name: '中关村校区体育馆', address: '北京市海淀区中关村南大街5号院', phone: '000-0000-0000', days: 3, refundHours: 12, cover: 'assets/zgc-photo.jpg' },
    { id: 'lx', name: '良乡校区体育馆', address: '北京市房山区良乡东路9号院北京理工大学（东区）', phone: '000-0000-0000', days: 5, refundHours: 2, cover: 'assets/lx-photo.jpg' }
  ];
  const hours = (start, end) => Array.from({ length: end - start }, (_, i) => [start + i, start + i + 1]);
  const numbered = (prefix, n, label) => Array.from({ length: n }, (_, i) => ({ id: prefix + (i + 1), name: label(i + 1) }));
  const badminton = numbered('zgc-b-', 12, n => n <= 8 ? '主馆' + n : '副馆' + n);
  const pool = [{ id: 'lx-pool-demo', name: '游泳池' }];
  const products = [
    { id: 'zgc-tennis', venue: 'zgc', name: '网球', resources: numbered('zgc-t-', 4, n => n + '号'), times: hours(9, 22), cents: 4000, sport: 'tennis' },
    { id: 'zgc-table', venue: 'zgc', name: '乒乓球', resources: numbered('zgc-p-', 5, n => n + '号'), times: hours(8, 22), cents: 1000, sport: 'table' },
    { id: 'zgc-basket', venue: 'zgc', name: '篮球', resources: [{ id: 'zgc-k-left', name: '室内篮球场：左' }, { id: 'zgc-k-right', name: '室内篮球场：右' }], times: hours(8, 22), cents: 5000, sport: 'basket' },
    { id: 'zgc-badminton', venue: 'zgc', name: '羽毛球', resources: badminton, times: hours(8, 22), cents: 3000, sport: 'badminton' },
    { id: 'zgc-early', venue: 'zgc', name: '羽毛球早晚场', resources: badminton, times: [[6, 7], [7, 8], [21, 22], [22, 23]], cents: 2000, sport: 'badminton' },
    { id: 'lx-table', venue: 'lx', name: '乒乓球', resources: numbered('lx-p-', 17, n => '桌' + n), times: hours(8, 22), cents: 1000, sport: 'table' },
    { id: 'lx-badminton', venue: 'lx', name: '羽毛球', resources: numbered('lx-b-', 10, n => '场' + n), times: hours(8, 23), cents: 3000, sport: 'badminton' },
    { id: 'lx-swim', venue: 'lx', name: '游泳', resources: pool, times: [[8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20]], cents: 1000, sport: 'swim', capacity: 4 },
    { id: 'lx-basket', venue: 'lx', name: '篮球', resources: [{ id: 'lx-k-left', name: '篮球场：左' }, { id: 'lx-k-right', name: '篮球场：右' }], times: hours(8, 22), cents: 5000, sport: 'basket' },
    { id: 'lx-child', venue: 'lx', name: '儿童游泳', resources: pool, times: [[8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20], [20, 21]], cents: 3000, sport: 'swim', capacity: 4 }
  ];
  const findProduct = id => products.find(p => p.id === id);
  const findVenue = id => venues.find(v => v.id === id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const dateOf = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
  const stamp = (date, h) => Date.parse(date + 'T' + String(h).padStart(2, '0') + ':00:00+08:00');
  const money = cents => (cents / 100).toFixed(2);
  const time = h => String(h).padStart(2, '0') + ':00';
  const key = s => [s.date, s.resourceId, s.start, s.end].join('|');
  const overlaps = (a, b) => a.resourceId === b.resourceId && a.date === b.date && a.start < b.end && b.start < a.end;
  const active = o => ['pending', 'paid', 'using', 'completed'].includes(o.status);
  const statusNames = { pending: '待支付', paid: '已支付待使用', using: '使用中', completed: '已完成', canceled: '已取消', expired: '已超时', refunded: '已退款' };
  const fixtureImages = typeof module === 'object' && module.exports ? require('./fixture-allowlist.js') : root.VenueDemoImages;
  const defaults = () => ({
    version: 1, revision: 0, serial: 0, balance: 0, orders: [], ledger: [], groups: [],
    profile: { name: '体验用户01', gender: '女', phone: 'DEMO-00000001', motto: '运动，让每一天更有活力', avatar: 'assets/avatar-a.svg', photo: 'assets/avatar-a.svg', boundId: '' },
    membership: null, health: { image: '', status: '未提交', submittedAt: 0 },
    settings: { mode: 'snapshot', scenario: 'available', fixedNow: '2026-10-14T07:00:00+08:00', prices: {}, remember: false }
  });
  class DemoService {
    constructor(storage, realClock) {
      this.storage = storage; this.realClock = realClock || Date.now;
      const raw = storage.load();
      this.state = raw ? JSON.parse(raw) : defaults();
      if (this.state.version !== 1 || !Array.isArray(this.state.orders)) throw new Error('演示数据格式不兼容，请恢复初始数据');
      this.expire();
    }
    now() { return this.state.settings.mode === 'rolling' ? this.realClock() : Date.parse(this.state.settings.fixedNow); }
    dates(venueId) { const v = findVenue(venueId); return Array.from({ length: v.days }, (_, i) => dateOf(this.now() + i * 86400000)); }
    snapshot() { this.expire(); return clone(this.state); }
    commit(fn) {
      const raw = this.storage.load();
      if (raw) {
        const stored = JSON.parse(raw);
        if ((stored.revision || 0) !== (this.state.revision || 0)) {
          this.state = stored;
          throw new Error('本地演示数据已更新，本次操作未执行，请刷新后重试');
        }
      }
      const next = clone(this.state); const result = fn(next);
      next.revision = (this.state.revision || 0) + 1;
      this.storage.save(JSON.stringify(next)); this.state = next; return result;
    }
    expire() {
      const now = this.now();
      if (this.state.orders.some(o => o.status === 'pending' && o.expiresAt <= now)) {
        this.commit(s => s.orders.forEach(o => { if (o.status === 'pending' && o.expiresAt <= now) { o.status = 'expired'; o.events.push({ at: now, action: '超时释放' }); } }));
      }
    }
    price(id) { const p = findProduct(id); return this.state.settings.prices[id] === undefined ? p.cents : this.state.settings.prices[id]; }
    slot(id, date, resourceId, start, end) {
      const p = findProduct(id);
      if (!p || !this.dates(p.venue).includes(date) || !p.resources.some(r => r.id === resourceId) || !p.times.some(t => t[0] === start && t[1] === end)) throw new Error('场次不属于当前项目、日期或开放时段');
      return { productId: id, venueId: p.venue, venueName: findVenue(p.venue).name, productName: p.name, resourceId, resourceName: p.resources.find(r => r.id === resourceId).name, date, start, end, cents: this.price(id), capacity: p.capacity || 1 };
    }
    inventory(slot, ignoreId) {
      if (stamp(slot.date, slot.start) <= this.now()) return { remaining: 0, reason: '已过预约时间' };
      if (this.state.settings.scenario === 'soldout') return { remaining: 0, reason: '模拟无票' };
      let used = 0;
      for (const o of this.state.orders) if (o.id !== ignoreId && active(o) && (o.status !== 'pending' || o.expiresAt > this.now())) for (const s of o.slots) if (overlaps(s, slot)) used++;
      // Small declared synthetic bookings make the disabled state demonstrable.
      const p = findProduct(slot.productId);
      if (slot.date === this.dates(p.venue)[0] && slot.resourceId === p.resources[0].id && slot.start === 12) used++;
      return { remaining: Math.max(0, (p.capacity || 1) - used), reason: used ? '有预约' : '可预约' };
    }
    availability(productId, date) {
      const p = findProduct(productId); let total = 0;
      for (const r of p.resources) for (const t of p.times) total += this.inventory(this.slot(p.id, date, r.id, t[0], t[1])).remaining;
      return total;
    }
    createOrder(input, token) {
      this.expire();
      const old = this.state.orders.find(o => o.token === token); if (old) return clone(old);
      if (!token || !input.length || input.length > 2) throw new Error('请选择1至2个场次（演示单次上限）');
      const slots = input.map(s => this.slot(s.productId, s.date, s.resourceId, s.start, s.end));
      if (input.some((s, i) => s.cents !== slots[i].cents)) throw new Error('演示价格已变化，请返回重新选择，付款未执行');
      if (new Set(slots.map(key)).size !== slots.length || slots.some(s => s.productId !== slots[0].productId || s.date !== slots[0].date)) throw new Error('同一订单只能包含同项目同日期且不重复的场次');
      if (slots.some(s => this.inventory(s).remaining < 1)) throw new Error('部分场次已被占用或不可预约，请返回重新选择');
      const now = this.now();
      return this.commit(s => {
        const order = { id: 'DEMO-' + String(++s.serial).padStart(6, '0'), token, slots, total: slots.reduce((n, x) => n + x.cents, 0), status: 'pending', payment: '北理工支付', createdAt: now, expiresAt: now + 900000, paidAt: 0, events: [{ at: now, action: '创建演示订单' }] };
        s.orders.unshift(order); return clone(order);
      });
    }
    getOrder(id) { this.expire(); const o = this.state.orders.find(o => o.id === id); if (!o) throw new Error('找不到演示订单'); return clone(o); }
    pay(id, method, fail) {
      this.expire(); const old = this.getOrder(id);
      if (old.status !== 'pending') { if (['paid', 'using', 'completed'].includes(old.status)) return old; throw new Error('当前订单不可付款'); }
      if (!['北理工支付', '余额支付'].includes(method)) throw new Error('请选择有效支付方式');
      if (fail) throw new Error('模拟支付失败，订单保留待支付，可重试');
      if (old.slots.some(s => this.inventory(s, id).remaining < 1)) throw new Error('库存冲突，付款未执行，请取消订单');
      if (method === '余额支付' && this.state.balance < old.total) throw new Error('演示余额不足，请先模拟充值或选择北理工支付');
      const now = this.now();
      return this.commit(s => {
        const o = s.orders.find(x => x.id === id);
        if (method === '余额支付') { s.balance -= o.total; s.ledger.unshift({ id: id + '-pay', cents: -o.total, reason: '预约余额支付', orderId: id, at: now }); }
        o.status = 'paid'; o.payment = method; o.paidAt = now; o.events.push({ at: now, action: method + '模拟成功' }); return clone(o);
      });
    }
    cancel(id) { const old = this.getOrder(id); if (old.status === 'canceled') return old; if (old.status !== 'pending') throw new Error('仅待支付订单可取消；已支付请申请退款'); return this.commit(s => { const o = s.orders.find(x => x.id === id); o.status = 'canceled'; o.events.push({ at: this.now(), action: '取消并释放场次' }); return clone(o); }); }
    refundable(id) {
      const o = this.getOrder(id); const v = findVenue(o.slots[0].venueId); const start = Math.min(...o.slots.map(s => stamp(s.date, s.start)));
      return o.status === 'paid' && start - this.now() >= v.refundHours * 3600000;
    }
    refund(id) {
      const old = this.getOrder(id); if (old.status === 'refunded') return old;
      if (!this.refundable(id)) throw new Error('当前订单不符合退款时限或已核销');
      return this.commit(s => { const o = s.orders.find(x => x.id === id); s.balance += o.total; o.status = 'refunded'; s.ledger.unshift({ id: id + '-refund', cents: o.total, reason: '退款退至演示余额', orderId: id, at: this.now() }); o.events.push({ at: this.now(), action: '退款并释放场次' }); return clone(o); });
    }
    redeem(id, action) {
      const old = this.getOrder(id); const swim = findProduct(old.slots[0].productId).sport === 'swim';
      if (action === 'entry' && old.status !== 'paid') throw new Error('只有待使用的已支付订单可入场核销');
      if (action === 'exit' && old.status !== 'using') throw new Error('请先完成入场核销');
      return this.commit(s => { const o = s.orders.find(x => x.id === id); o.status = action === 'entry' && swim ? 'using' : 'completed'; o.events.push({ at: this.now(), action: action === 'entry' ? '模拟入场核销' : '模拟游泳出场核销' }); return clone(o); });
    }
    recharge() { return this.commit(s => { s.balance += 20000; s.ledger.unshift({ id: 'DEMO-R-' + (++s.serial), cents: 20000, reason: '显式模拟充值，无真实资金', at: this.now() }); }); }
    orders(filter) { this.expire(); const map = { '全部': () => true, '待支付': o => o.status === 'pending', '已支付': o => ['paid', 'using'].includes(o.status), '已取消': o => ['canceled', 'expired', 'refunded'].includes(o.status), '已完成': o => o.status === 'completed' }; if (!map[filter]) throw new Error('未知订单筛选'); return clone(this.state.orders.filter(map[filter])); }
    saveProfile(p) {
      if (!/^体验用户\d{2}$/.test(p.name)) throw new Error('仅接受虚拟姓名：体验用户加两位数字');
      if (!['男', '女'].includes(p.gender) || !/^DEMO-\d{8}$/.test(p.phone)) throw new Error('请选择性别，虚拟号码格式为DEMO-加8位数字');
      if ([...p.motto].length > 20) throw new Error('格言最多20字符');
      const safe = { name: p.name, gender: p.gender, phone: p.phone, motto: p.motto };
      return this.commit(s => { Object.assign(s.profile, safe); });
    }
    setPhone(phone, code) { if (code !== '246810' || !/^DEMO-\d{8}$/.test(phone)) throw new Error('请输入DEMO-加8位数字及演示验证码246810'); return this.commit(s => { s.profile.phone = phone; }); }
    bind(id, method, value, fail) {
      if (fail) throw new Error('模拟认证失败，请重试；未发送任何学校请求');
      if (!/^DEMO-(STUDENT|STAFF)-\d{4}$/.test(id)) throw new Error('仅接受DEMO-STUDENT-0001或DEMO-STAFF-0001格式');
      const expected = { password: 'DEMO-PASS', sms: '246810', passkey: 'DEMO-PASSKEY', email: 'DEMO-MAIL' };
      if (value !== expected[method]) throw new Error('仅接受页面给出的虚拟体验凭据，不保存其他输入');
      return this.commit(s => { s.profile.boundId = id; });
    }
    buyMember(method, fail) {
      if (this.state.membership && this.state.membership.expiresAt > this.now()) throw new Error('演示会员卡已生效，无需重复购买');
      if (fail) throw new Error('模拟会员付款失败，可重试');
      if (!['北理工支付', '余额支付'].includes(method)) throw new Error('请选择支付方式');
      if (method === '余额支付' && this.state.balance < 5000) throw new Error('演示余额不足');
      return this.commit(s => { const id = 'DEMO-M-' + (++s.serial); if (method === '余额支付') { s.balance -= 5000; s.ledger.unshift({ id, cents: -5000, reason: '购买演示运动月卡', at: this.now() }); } s.membership = { id, name: '演示运动月卡', cents: 5000, boughtAt: this.now(), expiresAt: this.now() + 30 * 86400000, payment: method }; });
    }
    saveImage(target, data) {
      const builtin = ['assets/avatar-a.svg', 'assets/avatar-b.svg', 'assets/health-test.svg'];
      if (!builtin.includes(data) && !(data.startsWith('data:image/svg+xml;base64,') && data.length < 20000 && this.validTestImage(data))) throw new Error('只允许本应用提供的专用测试图片；未保存其他文件');
      return this.commit(s => { if (target === 'health') { s.health.image = data; s.health.status = '未提交'; s.health.submittedAt = 0; } else if (target === 'avatar') s.profile.avatar = data; else if (target === 'photo') s.profile.photo = data; else throw new Error('图片用途无效'); });
    }
    validTestImage(data) { return !!fixtureImages && fixtureImages.includes(data); }
    submitHealth(fail) { if (!this.state.health.image) throw new Error('请先选择测试健康证图片'); if (fail) throw new Error('模拟提交失败，测试图片保留，可重试'); return this.commit(s => { s.health.status = '演示待审核'; s.health.submittedAt = this.now(); }); }
    reviewHealth(result) { if (!this.state.health.submittedAt) throw new Error('请先提交测试图片'); if (!['演示通过', '演示驳回'].includes(result)) throw new Error('审核结果无效'); return this.commit(s => { s.health.status = result; }); }
    group(form) {
      const v = findVenue(form.venueId);
      if (!v || !form.activity.trim() || !/^体验用户\d{2}$/.test(form.contact) || !/^DEMO-\d{8}$/.test(form.phone) || !Number.isInteger(form.people) || form.people < 2 || form.people > 200) throw new Error('请填写活动、虚拟联系人/号码及2至200人的人数');
      if (!this.dates(v.id).includes(form.date) || !Number.isInteger(form.start) || !Number.isInteger(form.end) || form.start < 6 || form.end > 23 || form.start >= form.end) throw new Error('请选择预约窗口内日期和有效起止时间');
      if (form.activity.length > 40 || form.note.length > 200) throw new Error('活动名最多40字符，说明最多200字符');
      return this.commit(s => { const g = Object.assign({}, form, { id: 'DEMO-G-' + (++s.serial), status: '演示待受理', createdAt: this.now() }); s.groups.unshift(g); return clone(g); });
    }
    settings(p) {
      if (p.mode && !['snapshot', 'rolling'].includes(p.mode)) throw new Error('日期模式无效');
      if (p.scenario && !['available', 'soldout'].includes(p.scenario)) throw new Error('库存场景无效');
      if (p.fixedNow && !Number.isFinite(Date.parse(p.fixedNow))) throw new Error('演示时间无效');
      if (p.prices) for (const [id, n] of Object.entries(p.prices)) if (!findProduct(id) || !Number.isInteger(n) || n < 1 || n > 100000) throw new Error('演示价格必须为0.01至1000元');
      this.commit(s => Object.assign(s.settings, p)); this.expire();
    }
    advance(minutes) { if (this.state.settings.mode !== 'snapshot') throw new Error('请先切换视频复现模式'); this.settings({ fixedNow: new Date(this.now() + minutes * 60000).toISOString() }); }
    reset() { const s = defaults(); this.storage.save(JSON.stringify(s)); this.state = s; }
  }
  const api = { venues, products, findProduct, findVenue, DemoService, defaults, key, overlaps, stamp, dateOf, time, money, statusNames };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BookingDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
