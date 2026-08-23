<script setup lang="ts">
/**
 * Shared entity list host: artists / albums / tracks / search.
 * Cover overrides via optional getters (downloads local art).
 */

import { computed } from "vue";
import AlbumCard from "@/components/library/rows/AlbumCard.vue";
import AlbumListRow from "@/components/library/rows/AlbumListRow.vue";
import ArtistCard from "@/components/library/rows/ArtistCard.vue";
import ArtistRow from "@/components/library/rows/ArtistRow.vue";
import TrackRow from "@/components/library/rows/TrackRow.vue";
import type { LibraryAlbum, LibraryBody } from "@/components/library/loaders";
import type { Artist } from "@/models/artist";
import type { Track } from "@/models/track";

export interface EntityMenuHandlers<T> {
  onMenuClick: (item: T, e: MouseEvent) => void;
  onRowContextMenu: (item: T, e: MouseEvent) => void;
}

export interface EntityActions {
  artist?: EntityMenuHandlers<Artist> & {
    includePhoto: boolean;
    onThumbDrop?: (artist: Artist, file: File) => void;
  };
  album?: EntityMenuHandlers<LibraryAlbum>;
  track?: EntityMenuHandlers<Track>;
}

const props = withDefaults(defineProps<{
  body: LibraryBody;
  error?: string;
  loading?: boolean;
  isGrid?: boolean;
  gridHost?: boolean;
  showTrackDownload?: boolean;
  artistCover?: ((item: Artist) => string) | null;
  albumCover?: ((item: LibraryAlbum) => string) | null;
  trackCover?: ((item: Track) => string) | null;
  entityActions?: EntityActions | null;
}>(), { error: "", loading: false, isGrid: false, gridHost: false, showTrackDownload: true, artistCover: null, albumCover: null, trackCover: null, entityActions: null });
const emit = defineEmits<{
  "open-artist": [artist: Artist];
  "open-album": [album: LibraryAlbum];
}>();
function artistSrc(artist: Artist): string | null {
      return props.artistCover ? props.artistCover(artist) : null;
    }
    function albumSrc(album: LibraryAlbum): string | null {
      return props.albumCover ? props.albumCover(album) : null;
    }
    function trackSrc(track: Track): string | null {
      return props.trackCover ? props.trackCover(track) : null;
    }
    function openArtist(a: Artist) {
      emit("open-artist", a);
    }
    function openAlbum(a: LibraryAlbum) {
      emit("open-album", a);
    }
    const artistActions = computed(() => props.entityActions?.artist);
    const albumActions = computed(() => props.entityActions?.album);
    const trackActions = computed(() => props.entityActions?.track);
</script>

<template>
    <div class="row-list" :class="{ 'album-grid-host': gridHost }">
      <div v-if="error" class="list-empty">Error: {{ error }}</div>
      <div v-else-if="loading" class="list-empty">Loading…</div>
      <div v-else-if="body.kind === 'empty'" class="list-empty">{{ body.message }}</div>

      <template v-else-if="body.kind === 'artists'">
        <div v-if="isGrid" class="album-grid">
          <ArtistCard
            v-for="artist in body.artists"
            :key="artist.id"
            :artist="artist"
            :cover-src="artistSrc(artist)"
            :show-menu="!!artistActions"
            :include-photo="!!artistActions?.includePhoto"
            @open="openArtist"
            @menu-click="(a, e) => artistActions?.onMenuClick(a, e)"
            @row-contextmenu="(a, e) => artistActions?.onRowContextMenu(a, e)"
            @thumb-drop="(a, f) => artistActions?.onThumbDrop?.(a, f)"
          />
        </div>
        <template v-else>
          <ArtistRow
            v-for="artist in body.artists"
            :key="artist.id"
            :artist="artist"
            :cover-src="artistSrc(artist)"
            :show-menu="!!artistActions"
            :include-photo="!!artistActions?.includePhoto"
            @open="openArtist"
            @menu-click="(a, e) => artistActions?.onMenuClick(a, e)"
            @row-contextmenu="(a, e) => artistActions?.onRowContextMenu(a, e)"
            @thumb-drop="(a, f) => artistActions?.onThumbDrop?.(a, f)"
          />
        </template>
      </template>

      <template v-else-if="body.kind === 'albumGrid'">
        <div v-if="isGrid" class="album-grid">
          <AlbumCard
            v-for="album in body.albums"
            :key="album.id"
            :album="album"
            :cover-src="albumSrc(album)"
            :show-menu="!!albumActions"
            @open="openAlbum"
            @menu-click="(a, e) => albumActions?.onMenuClick(a, e)"
            @row-contextmenu="(a, e) => albumActions?.onRowContextMenu(a, e)"
          />
        </div>
        <template v-else>
          <AlbumListRow
            v-for="album in body.albums"
            :key="album.id"
            :album="album"
            :cover-src="albumSrc(album)"
            :show-menu="!!albumActions"
            @open="openAlbum"
            @menu-click="(a, e) => albumActions?.onMenuClick(a, e)"
            @row-contextmenu="(a, e) => albumActions?.onRowContextMenu(a, e)"
          />
        </template>
      </template>

      <template v-else-if="body.kind === 'tracks'">
        <TrackRow
          v-for="track in body.tracks"
          :key="track.id"
          :track="track"
          :cover-src="trackSrc(track)"
          :show-download="showTrackDownload"
          :show-menu="!!trackActions"
          @menu-click="(t, e) => trackActions?.onMenuClick(t, e)"
          @row-contextmenu="(t, e) => trackActions?.onRowContextMenu(t, e)"
        />
      </template>

      <template v-else-if="body.kind === 'search'">
        <template v-if="body.sections.artists.length">
          <div class="section-label">Artists</div>
          <ArtistRow
            v-for="artist in body.sections.artists"
            :key="'sa-' + artist.id"
            :artist="artist"
            :show-counts="false"
            :cover-src="artistSrc(artist)"
            :show-menu="!!artistActions"
            :include-photo="!!artistActions?.includePhoto"
            @open="openArtist"
            @menu-click="(a, e) => artistActions?.onMenuClick(a, e)"
            @row-contextmenu="(a, e) => artistActions?.onRowContextMenu(a, e)"
            @thumb-drop="(a, f) => artistActions?.onThumbDrop?.(a, f)"
          />
        </template>
        <template v-if="body.sections.albums.length">
          <div class="section-label">Albums</div>
          <AlbumListRow
            v-for="album in body.sections.albums"
            :key="'sal-' + album.id"
            :album="album"
            :cover-src="albumSrc(album)"
            :show-menu="!!albumActions"
            @open="openAlbum"
            @menu-click="(a, e) => albumActions?.onMenuClick(a, e)"
            @row-contextmenu="(a, e) => albumActions?.onRowContextMenu(a, e)"
          />
        </template>
        <template v-if="body.sections.tracks.length">
          <div class="section-label">Tracks</div>
          <TrackRow
            v-for="track in body.sections.tracks"
            :key="'st-' + track.id"
            :track="track"
            :cover-src="trackSrc(track)"
            :show-download="showTrackDownload"
            :show-menu="!!trackActions"
            title-mode="title"
            subtitle-mode="artist-album"
            @menu-click="(t, e) => trackActions?.onMenuClick(t, e)"
            @row-contextmenu="(t, e) => trackActions?.onRowContextMenu(t, e)"
          />
        </template>
      </template>
    </div>
</template>
