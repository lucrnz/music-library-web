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
import { downloads } from "../../downloads/state.js";
import { addToQueue } from "../../stores/playlist.js";
import { openSettings } from "../../stores/settings.js";
import Icon from "../icons/Icon.js";
import ModeBar from "../layout/ModeBar.js";
import AlbumCard from "../library/rows/AlbumCard.js";
import ArtistRow from "../library/rows/ArtistRow.js";
import TrackRow from "../library/rows/TrackRow.js";

export default defineComponent({
  name: "DownloadsLibraryView",
  components: { Icon, ModeBar, AlbumCard, ArtistRow, TrackRow },
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

    function albumCoverSrc(album) {
      return localArt.value[`al:${album.id}`] || "";
    }

    function artistCoverSrc(artist) {
      return localArt.value[`a:${artist.id}`] || "";
    }

    function trackCoverSrc(track) {
      const id = track.albumId;
      return (id && localArt.value[`al:${id}`]) || "";
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
      albumCoverSrc,
      artistCoverSrc,
      trackCoverSrc,
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
          <ArtistRow
            v-for="artist in artists"
            :key="artist.id"
            :artist="artist"
            :cover-src="artistCoverSrc(artist)"
            @open="openArtist"
          />
        </template>

        <template v-else-if="albumGrid && albums.length">
          <div class="album-grid">
            <AlbumCard
              v-for="album in albums"
              :key="album.id"
              :album="album"
              :cover-src="albumCoverSrc(album)"
              @open="openAlbum"
            />
          </div>
        </template>

        <template v-else-if="tracks.length">
          <TrackRow
            v-for="track in tracks"
            :key="track.id"
            :track="track"
            :cover-src="trackCoverSrc(track)"
            :show-download="false"
          />
        </template>
      </div>
    </section>
  `,
});
