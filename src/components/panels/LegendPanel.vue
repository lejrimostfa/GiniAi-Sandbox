<script setup lang="ts">
// --- Legend Panel ---
// Visual legend explaining the encoding: shape → state, size → resource, etc.
// Pedagogical feature for teaching socio-economic concepts
</script>

<template>
  <div class="legend-panel panel">
    <div class="panel__title">Visual Legend</div>

    <div class="legend__section">
      <div class="legend__subtitle">Agent States</div>
      <div class="legend__item">
        <span class="legend__swatch" style="background: #5B8FB9;" />
        <span><strong>W</strong> — Worker (integrated)</span>
      </div>
      <div class="legend__item">
        <span class="legend__swatch" style="background: #E07A5F;" />
        <span><strong>P</strong> — Precarious (displaced)</span>
      </div>
      <div class="legend__item">
        <span class="legend__swatch" style="background: #3D405B;" />
        <span><strong>O</strong> — Owner (capital holder)</span>
      </div>
    </div>

    <div class="legend__section">
      <div class="legend__subtitle">Visual Encoding</div>
      <div class="legend__item">
        <span class="legend__icon">&#9650;</span>
        <span>Pedestal height = resource level</span>
      </div>
      <div class="legend__item">
        <span class="legend__icon">&#9679;</span>
        <span>Sphere size = resource buffer</span>
      </div>
      <div class="legend__item">
        <span class="legend__icon" style="color: #81B29A;">&#9711;</span>
        <span>Glowing ring = redistribution</span>
      </div>
      <div class="legend__item">
        <span class="legend__icon" style="color: #C44536;">&#9632;</span>
        <span>Ground warmth = stress level</span>
      </div>
      <div class="legend__item">
        <span class="legend__icon" style="color: #555566;">&#9632;</span>
        <span>Geometric blocks = owner infrastructure</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.legend-panel {
  font-size: $font-size-sm;
}

.legend__section {
  margin-bottom: $space-md;
}

.legend__subtitle {
  font-size: $font-size-xs;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: $space-xs;
}

.legend__item {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: 2px 0;
  color: $text-secondary;

  strong {
    color: $text-primary;
  }
}

.legend__swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.legend__icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
  font-size: 12px;
}
</style>
