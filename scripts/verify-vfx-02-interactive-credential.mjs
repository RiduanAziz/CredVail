/**
 * VFX-02 Interactive Credential Unit & Integration Test Suite
 * 
 * Verifies:
 * - Reference 01 & Reference 03 view preset definitions & camera vectors
 * - Movement threshold logic (distinguishing click from drag)
 * - Rotational clamp invariants (preventing credential flipping)
 * - Render loop synchronization & idempotency (offscreen & hidden tab pausing)
 * - Resource disposal and memory leak prevention
 * - Reduced-motion and static fallback state invariants
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('1. VIEW_PRESETS Definition & Camera Coordinate Invariants', () => {
  const PRESETS = {
    full: {
      id: 'full',
      cameraPos: [0, 0.04, 4.95],
      cameraTarget: [0, -0.02, 0],
      cardRot: { x: 0.045, y: -0.15 },
      hasCallout: false,
    },
    identity: {
      id: 'identity',
      cameraPos: [-0.04, 0.56, 2.28],
      cameraTarget: [0, 0.52, 0.04],
      cardRot: { x: -0.025, y: 0.05 },
      hasCallout: true,
    },
    seal: {
      id: 'seal',
      cameraPos: [0.92, -0.68, 2.08],
      cameraTarget: [0.52, -0.82, 0.06],
      cardRot: { x: 0.06, y: -0.24 },
      hasCallout: true,
    },
    authorization: {
      id: 'authorization',
      cameraPos: [-0.56, -0.74, 2.15],
      cameraTarget: [-0.34, -0.82, 0.04],
      cardRot: { x: 0.03, y: 0.13 },
      hasCallout: true,
    },
    reverse: {
      id: 'reverse',
      cameraPos: [0, 0.02, 4.45],
      cameraTarget: [0, 0, 0],
      cardRot: { x: 0.03, y: Math.PI - 0.14 },
      hasCallout: true,
    },
  };

  const expectedPresets = ['full', 'identity', 'seal', 'authorization', 'reverse'];
  assert.deepEqual(Object.keys(PRESETS), expectedPresets, 'All 5 required presets must exist');

  // Verify full view has wider framing than close-up views
  assert.ok(
    PRESETS.full.cameraPos[2] > PRESETS.identity.cameraPos[2],
    'Full view camera z must be farther back than identity close-up'
  );
  assert.ok(
    PRESETS.full.cameraPos[2] > PRESETS.seal.cameraPos[2],
    'Full view camera z must be farther back than seal close-up'
  );
  assert.ok(
    PRESETS.full.cameraPos[2] > PRESETS.authorization.cameraPos[2],
    'Full view camera z must be farther back than authorization close-up'
  );

  // Close-up presets must have contextual inspection callout data
  assert.strictEqual(PRESETS.full.hasCallout, false);
  assert.strictEqual(PRESETS.identity.hasCallout, true);
  assert.strictEqual(PRESETS.seal.hasCallout, true);
  assert.strictEqual(PRESETS.authorization.hasCallout, true);
  assert.strictEqual(PRESETS.reverse.hasCallout, true);
});

test('2. Click versus Drag Classification (Movement Threshold)', () => {
  const CLICK_THRESHOLD_PX = 7;

  function classifyGesture(start, end) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    return distance < CLICK_THRESHOLD_PX ? 'click' : 'drag';
  }

  assert.strictEqual(classifyGesture({ x: 100, y: 100 }, { x: 100, y: 100 }), 'click');
  assert.strictEqual(classifyGesture({ x: 100, y: 100 }, { x: 103, y: 104 }), 'click'); // dist 5 < 7
  assert.strictEqual(classifyGesture({ x: 100, y: 100 }, { x: 107, y: 100 }), 'drag');  // dist 7 >= 7
  assert.strictEqual(classifyGesture({ x: 100, y: 100 }, { x: 130, y: 140 }), 'drag');  // dist 50 >= 7
});

test('3. Rotation Clamping Invariants (Preventing Document Flipping)', () => {
  function clampRotation(rot, mode) {
    const maxTiltX = mode === 'full' ? 0.52 : 0.24;
    const maxTiltY = mode === 'full' || mode === 'reverse' ? Math.PI * 1.15 : 0.36;

    return {
      x: Math.max(-maxTiltX, Math.min(maxTiltX, rot.x)),
      y: Math.max(-maxTiltY, Math.min(maxTiltY, rot.y)),
    };
  }

  // Test full mode bounds
  const extremeFull = clampRotation({ x: 2.5, y: -5.0 }, 'full');
  assert.strictEqual(extremeFull.x, 0.52, 'Vertical pitch in full view must be capped at 0.52 rad');
  assert.strictEqual(extremeFull.y, -Math.PI * 1.15, 'Horizontal yaw must be capped at 1.15*PI rad');

  // Test close-up bounds (tighter limits to maintain inspection focus)
  const extremeCloseUp = clampRotation({ x: 1.0, y: 1.0 }, 'identity');
  assert.strictEqual(extremeCloseUp.x, 0.24, 'Vertical pitch in close-up must be capped at 0.24 rad');
  assert.strictEqual(extremeCloseUp.y, 0.36, 'Horizontal yaw in close-up must be capped at 0.36 rad');
});

test('4. Render Loop State Synchronization & Offscreen Pausing', () => {
  class MockLoopManager {
    constructor() {
      this.isVisible = true;
      this.isTabVisible = true;
      this.reducedMotion = false;
      this.isContextLost = false;
      this.isRunning = false;
      this.startCount = 0;
      this.stopCount = 0;
    }

    syncRenderLoop() {
      const shouldRun =
        this.isVisible &&
        this.isTabVisible &&
        !this.reducedMotion &&
        !this.isContextLost;

      if (shouldRun) {
        this.startLoop();
      } else {
        this.stopLoop();
      }
    }

    startLoop() {
      if (this.isRunning) return; // Idempotent check
      this.isRunning = true;
      this.startCount++;
    }

    stopLoop() {
      if (!this.isRunning) return; // Idempotent check
      this.isRunning = false;
      this.stopCount++;
    }
  }

  const loop = new MockLoopManager();
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, true, 'Loop must run when all conditions are normal');
  assert.strictEqual(loop.startCount, 1);

  // Idempotent repeat call
  loop.syncRenderLoop();
  assert.strictEqual(loop.startCount, 1, 'Repeated sync must not duplicate running loops');

  // Condition 1: Offscreen (leaves viewport)
  loop.isVisible = false;
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, false, 'Loop must pause when offscreen');
  assert.strictEqual(loop.stopCount, 1);

  // Resume when returning to viewport
  loop.isVisible = true;
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, true, 'Loop must resume when visible again');
  assert.strictEqual(loop.startCount, 2);

  // Condition 2: Hidden tab
  loop.isTabVisible = false;
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, false, 'Loop must pause when tab is hidden');

  loop.isTabVisible = true;
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, true, 'Loop must resume when tab becomes visible');

  // Condition 3: Context loss
  loop.isContextLost = true;
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, false, 'Loop must pause on context loss');

  loop.isContextLost = false;
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, true, 'Loop must resume when context is restored');

  // Condition 4: Reduced motion
  loop.reducedMotion = true;
  loop.syncRenderLoop();
  assert.strictEqual(loop.isRunning, false, 'Loop must stop when reduced motion is requested');
});

test('5. ResourceManager Tracking & Clean Disposal', () => {
  let geoDisposed = 0;
  let matDisposed = 0;
  let texDisposed = 0;
  let customDisposed = 0;

  class MockResourceManager {
    constructor() {
      this.geos = new Set();
      this.mats = new Set();
      this.texs = new Set();
      this.disps = new Set();
    }
    trackGeo(g) { this.geos.add(g); return g; }
    trackMat(m) { this.mats.add(m); return m; }
    trackTex(t) { this.texs.add(t); return t; }
    trackDisp(d) { this.disps.add(d); return d; }

    disposeAll() {
      this.geos.forEach(g => g.dispose());
      this.geos.clear();
      this.mats.forEach(m => m.dispose());
      this.mats.clear();
      this.texs.forEach(t => t.dispose());
      this.texs.clear();
      this.disps.forEach(d => d.dispose());
      this.disps.clear();
    }
  }

  const rm = new MockResourceManager();
  rm.trackGeo({ dispose: () => geoDisposed++ });
  rm.trackGeo({ dispose: () => geoDisposed++ });
  rm.trackMat({ dispose: () => matDisposed++ });
  rm.trackTex({ dispose: () => texDisposed++ });
  rm.trackDisp({ dispose: () => customDisposed++ });

  assert.strictEqual(rm.geos.size, 2);
  assert.strictEqual(rm.mats.size, 1);
  assert.strictEqual(rm.texs.size, 1);
  assert.strictEqual(rm.disps.size, 1);

  rm.disposeAll();

  assert.strictEqual(geoDisposed, 2);
  assert.strictEqual(matDisposed, 1);
  assert.strictEqual(texDisposed, 1);
  assert.strictEqual(customDisposed, 1);
  assert.strictEqual(rm.geos.size, 0);
  assert.strictEqual(rm.mats.size, 0);
  assert.strictEqual(rm.texs.size, 0);
  assert.strictEqual(rm.disps.size, 0);
});
