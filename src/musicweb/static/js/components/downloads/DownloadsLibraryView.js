/**
 * Offline downloads mini-library (artist → album → tracks).
 */
import {
  computed,
  defineComponent,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { loadDownloadsView } from "../../downloads/browse.js";
import { addToQueue } from "../../stores/playlist.js";
import { downloads } from "../../stores/downloads.js";
import { openSettings } from "../../stores/settings.js";
import Icon from "../icons/Icon.js";
import ModeBar from "../layout/ModeBar.js";
import { formatTrackLabel, playOrQueueTrack, queueOnly } from "../library/rows.js";

export default defineComponent({
  name: "DownloadsLibraryView",
  components: { Icon, ModeBar },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const title = ref("Downloads");
    const showBack = ref(false);
    const emptyMsg = ref("");
    const error = ref("");
    const loading = ref(false);
    const artists = ref([]);
    const albums = ref([]);
    const tracks = ref([]);
    const albumGrid = ref(false);
    const localArt = ref({});
    let renderSeq = 0;

    const routeName = computed(() => route.name);
    const artistId = computed(() => route.params?.artistId);
    const albumId = computed(() => route.params?.albumId);
    const showAddAll = computed(() => Boolean(tracks.value.length));

    function isCurrent(seq) {
      return seq === renderSeq;
    }

    async function load() {
      const seq = ++renderSeq;
      error.value = "";
      emptyMsg.value = "";
      artists.value = [];
      albums.value = [];
      tracks.value = [];
      albumGrid.value = false;
      loading.value = true;
      try {
        const view = await loadDownloadsView({
          routeName: String(routeName.value || "downloads"),
          artistId: artistId.value ? String(artistId.value) : undefined,
          albumId: albumId.value ? String(albumId.value) : undefined,
          enabled: downloads.enabled,
        });
        if (!isCurrent(seq)) return;
        title.value = view.title;
        showBack.value = view.showBack;
        emptyMsg.value = view.emptyMsg;
        artists.value = view.artists;
        albums.value = view.albums;
        tracks.value = view.tracks;
        albumGrid.value = view.albumGrid;
        localArt.value = view.artUrls;
      } catch (err) {
        if (!isCurrent(seq)) return;
        error.value = err.message || String(err);
      } finally {
        if (isCurrent(seq)) loading.value = false;
      }
    }

    function goBack() {
      if (routeName.value === "downloads-album") {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push({ name: "downloads" });
        return;
      }
      if (routeName.value === "downloads-artist") {
        router.push({ name: "downloads" });
      }
    }

    function openArtist(artist) {
      router.push({
        name: "downloads-artist",
        params: { artistId: artist.id },
      });
    }

    function openAlbum(album) {
      router.push({
        name: "downloads-album",
        params: { albumId: album.id },
      });
    }

    async function addAll() {
      try {
        if (tracks.value.length) await addToQueue(tracks.value);
      } catch (err) {
        console.error(err);
      }
    }

    function albumCover(album) {
      return localArt.value[`al:${album.id}`] || "/static/img/placeholder.svg";
    }

    function artistCover(artist) {
      return localArt.value[`a:${artist.id}`] || "/static/img/placeholder.svg";
    }

    function trackCover(track) {
      const id = track.album_id || track.albumId;
      return (
        (id && localArt.value[`al:${id}`]) || "/static/img/placeholder.svg"
      );
    }

    watch(
      () => [route.fullPath, downloads.enabled, downloads.trackCount],
      () => load(),
      { immediate: true }
    );

    return {
      downloads,
      title,
      showBack,
      emptyMsg,
      error,
      loading,
      artists,
      albums,
      tracks,
      albumGrid,
      showAddAll,
      goBack,
      openArtist,
      openAlbum,
      addAll,
      albumCover,
      artistCover,
      trackCover,
      playOrQueueTrack,
      queueOnly,
      formatTrackLabel,
      openSettings,
    };
  },
  template: `
    <section id="view-library" class="view" aria-label="Downloads library">
      <div
        v-if="downloads.connectivityNote"
        class="offline-banner"
        role="status"
      >{{ downloads.connectivityNote }}</div>
      <div class="view-bar">
        <button
          v-if="showBack"
          type="button"
          class="icon-btn"
          title="Back"
          aria-label="Back"
          @click="goBack"
        >
          <Icon name="chevron-left" />
        </button>
        <div class="view-title">{{ title }}</div>
        <div class="view-actions">
          <button
            v-if="showAddAll"
            type="button"
            class="pill"
            @click="addAll"
          >Add all</button>
          <button
            type="button"
            class="icon-btn"
            title="Settings"
            aria-label="Settings"
            aria-haspopup="dialog"
            @click="openSettings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>

      <ModeBar />

      <div class="row-list" :class="{ 'album-grid-host': albumGrid }">
        <div v-if="error" class="list-empty">Error: {{ error }}</div>
        <div v-else-if="loading" class="list-empty">Loading…</div>
        <div v-else-if="emptyMsg" class="list-empty">{{ emptyMsg }}</div>

        <template v-else-if="artists.length">
          <div
            v-for="artist in artists"
            :key="artist.id"
            class="row"
            @click="openArtist(artist)"
          >
            <span class="row-cover-wrap">
              <img class="row-cover" :src="artistCover(artist)" alt="" loading="lazy" />
            </span>
            <span class="row-meta">
              <span class="row-title">{{ artist.name }}</span>
              <span class="row-sub">{{ artist.album_count }} album{{ artist.album_count === 1 ? '' : 's' }} · {{ artist.track_count }} tracks</span>
            </span>
            <span class="row-chevron"><Icon name="chevron-right" /></span>
          </div>
        </template>

        <template v-else-if="albumGrid && albums.length">
          <div class="album-grid">
            <button
              v-for="album in albums"
              :key="album.id"
              type="button"
              class="album-card"
              @click="openAlbum(album)"
            >
              <img class="album-card-cover" :src="albumCover(album)" alt="" loading="lazy" />
              <span class="album-card-title">{{ album.title }}</span>
              <span class="album-card-sub">{{ [album.artist, album.year].filter(Boolean).join(' · ') }}</span>
            </button>
          </div>
        </template>

        <template v-else-if="tracks.length">
          <div
            v-for="track in tracks"
            :key="track.id"
            class="row"
            @click="(e) => { if (!e.target.closest('.row-add')) playOrQueueTrack(track); }"
          >
            <span class="row-cover-wrap">
              <img class="row-cover" :src="trackCover(track)" alt="" loading="lazy" />
            </span>
            <span class="row-meta">
              <span class="row-title">{{ formatTrackLabel(track) }}</span>
              <span class="row-sub">{{ track.artist || '' }}</span>
            </span>
            <button
              type="button"
              class="icon-btn row-add"
              title="Add to playlist"
              aria-label="Add to playlist"
              @click.stop="queueOnly(track)"
            ><Icon name="plus" /></button>
          </div>
        </template>
      </div>
    </section>
  `,
});
