<script setup lang="ts">
/**
 * Shared entity list host: artists / albums / tracks (+ online folders & search).
 * Cover overrides via optional getters (downloads local art).
 */

import AlbumCard from "@/components/library/rows/AlbumCard.vue";
import AlbumListRow from "@/components/library/rows/AlbumListRow.vue";
import ArtistCard from "@/components/library/rows/ArtistCard.vue";
import ArtistRow from "@/components/library/rows/ArtistRow.vue";
import FileCard from "@/components/library/rows/FileCard.vue";
import FileRow from "@/components/library/rows/FileRow.vue";
import FolderCard from "@/components/library/rows/FolderCard.vue";
import FolderRow from "@/components/library/rows/FolderRow.vue";
import TrackRow from "@/components/library/rows/TrackRow.vue";
import type {
  FileRowModel,
  LibraryAlbum,
  LibraryBody,
} from "@/components/library/loaders";
import type { ArtistListItem, BrowseDir } from "@/api";
import type { Track } from "@/models/track";
const props = withDefaults(defineProps<{
  body: LibraryBody;
  error?: string;
  loading?: boolean;
  isGrid?: boolean;
  gridHost?: boolean;
  showTrackDownload?: boolean;
  artistCover?: ((item: ArtistListItem) => string) | null;
  albumCover?: ((item: LibraryAlbum) => string) | null;
  trackCover?: ((item: Track) => string) | null;
  isSelected?: ((path: string) => boolean) | null;
}>(), { error: "", loading: false, isGrid: false, gridHost: false, showTrackDownload: true, artistCover: null, albumCover: null, trackCover: null, isSelected: null });
const emit = defineEmits<{
  "open-artist": [artist: ArtistListItem];
  "open-album": [album: LibraryAlbum];
  "open-folder": [dir: BrowseDir];
  "select-folder": [dir: BrowseDir];
  "select-file": [file: FileRowModel];
}>();
function artistSrc(artist: ArtistListItem) {
      return props.artistCover ? props.artistCover(artist) : "";
    }
    function albumSrc(album: LibraryAlbum) {
      return props.albumCover ? props.albumCover(album) : "";
    }
    function trackSrc(track: Track) {
      return props.trackCover ? props.trackCover(track) : "";
    }
    function selected(path: string) {
      return props.isSelected ? props.isSelected(path) : false;
    }
    function openArtist(a: ArtistListItem) {
      emit("open-artist", a);
    }
    function openAlbum(a: LibraryAlbum) {
      emit("open-album", a);
    }
    function openFolder(d: BrowseDir) {
      emit("open-folder", d);
    }
    function selectFolder(d: BrowseDir) {
      emit("select-folder", d);
    }
    function selectFile(f: FileRowModel) {
      emit("select-file", f);
    }
</script>

<template>
    <div class="row-list" :class="{ 'album-grid-host': gridHost }">
      <div v-if="error" class="list-empty">Error: {{ error }}</div>
      <div v-else-if="loading" class="list-empty">Loading…</div>
      <div v-else-if="body.kind === 'empty'" class="list-empty">{{ body.message }}</div>

      <template v-else-if="body.kind === 'folders'">
        <div v-if="isGrid" class="album-grid">
          <FolderCard
            v-for="dir in body.dirs"
            :key="'d-' + dir.path"
            :dir="dir"
            :selected="selected(dir.path)"
            @open="openFolder"
            @select="selectFolder"
          />
          <FileCard
            v-for="file in body.files"
            :key="'f-' + file.path"
            :file="file"
            :selected="selected(file.path)"
            @select="selectFile"
          />
        </div>
        <template v-else>
          <FolderRow
            v-for="dir in body.dirs"
            :key="'d-' + dir.path"
            :dir="dir"
            :selected="selected(dir.path)"
            @open="openFolder"
            @select="selectFolder"
          />
          <FileRow
            v-for="file in body.files"
            :key="'f-' + file.path"
            :file="file"
            :selected="selected(file.path)"
            @select="selectFile"
          />
        </template>
      </template>

      <template v-else-if="body.kind === 'artists'">
        <div v-if="isGrid" class="album-grid">
          <ArtistCard
            v-for="artist in body.artists"
            :key="artist.id"
            :artist="artist"
            :cover-src="artistSrc(artist)"
            @open="openArtist"
          />
        </div>
        <template v-else>
          <ArtistRow
            v-for="artist in body.artists"
            :key="artist.id"
            :artist="artist"
            :cover-src="artistSrc(artist)"
            @open="openArtist"
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
            @open="openAlbum"
          />
        </div>
        <template v-else>
          <AlbumListRow
            v-for="album in body.albums"
            :key="album.id"
            :album="album"
            :cover-src="albumSrc(album)"
            @open="openAlbum"
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
            @open="openArtist"
          />
        </template>
        <template v-if="body.sections.albums.length">
          <div class="section-label">Albums</div>
          <AlbumListRow
            v-for="album in body.sections.albums"
            :key="'sal-' + album.id"
            :album="album"
            :cover-src="albumSrc(album)"
            @open="openAlbum"
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
            title-mode="title"
            subtitle-mode="artist-album"
          />
        </template>
      </template>
    </div>
</template>
