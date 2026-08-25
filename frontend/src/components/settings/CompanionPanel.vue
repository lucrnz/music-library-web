<script setup lang="ts">
/**
 * Desktop companion: token, port, connection. Installed desktop PWA.
 */
import { computed } from "vue";
import {
  exclusiveAudio,
  setExclusivePort,
  setCompanionToken,
} from "@/stores/exclusiveAudio";
import {
  disconnectCompanion,
  syncCompanionConnection,
} from "@/exclusive/companionClient";
import { DEFAULT_PORT } from "@/exclusive/protocol";

const face = computed(() => {
  void exclusiveAudio.connection;
  void exclusiveAudio.role;
  void exclusiveAudio.lastError;
  const c = exclusiveAudio.connection;
  if (c === "connected") {
    const role = exclusiveAudio.role === "readonly" ? " · read-only" : "";
    return `Connected${role}`;
  }
  if (c === "connecting") return "Connecting…";
  if (c === "rejected") return exclusiveAudio.lastError || "Auth rejected";
  return "Offline";
});

function onToken(e: Event) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  setCompanionToken(target.value);
}

function onTokenCommit() {
  if (!(exclusiveAudio.companionToken || "").trim()) disconnectCompanion();
  else syncCompanionConnection();
}

function onPort(e: Event) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  setExclusivePort(target.value);
  syncCompanionConnection();
}
</script>

<template>
  <div class="modal-section">
    <div class="modal-section-title">Desktop companion</div>
    <p class="modal-hint">
      Run
      <code>COMPANION_TOKEN=… uv run musicweb companion</code>
      on this computer and paste the same token. The data directory is printed
      when the companion starts.
    </p>

    <div class="settings-field">
      <label class="settings-field-label" id="companion-token-label" for="companion-token">
        COMPANION_TOKEN
      </label>
      <input
        id="companion-token"
        type="password"
        autocomplete="off"
        spellcheck="false"
        class="text-input text-input-block"
        :value="exclusiveAudio.companionToken"
        @input="onToken"
        @change="onTokenCommit"
        placeholder="Same value as companion env"
        aria-labelledby="companion-token-label"
      />
    </div>

    <div class="settings-field">
      <label class="settings-field-label" id="companion-port-label" for="companion-port">
        Companion port (default {{ DEFAULT_PORT }})
      </label>
      <input
        id="companion-port"
        type="number"
        min="1"
        max="65535"
        class="text-input text-input-narrow"
        :value="exclusiveAudio.port"
        @change="onPort"
        aria-labelledby="companion-port-label"
      />
    </div>

    <p class="modal-hint" style="margin-top:10px">
      Status: {{ face }}
    </p>
    <p v-if="exclusiveAudio.dataDir" class="modal-hint">
      Files: <code>{{ exclusiveAudio.dataDir }}</code>
    </p>
    <p
      v-if="exclusiveAudio.lastError && exclusiveAudio.connection !== 'connected'"
      class="modal-hint warn"
    >
      {{ exclusiveAudio.lastError }}
    </p>
  </div>
</template>
