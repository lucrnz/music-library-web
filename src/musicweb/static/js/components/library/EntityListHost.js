/**
 * Shared entity list host: artists / albums / tracks (+ online folders & search).
 * Cover overrides via optional getters (downloads local art).
 */
import { defineComponent } from "vue";
import AlbumCard from "./rows/AlbumCard.js";
import AlbumListRow from "./rows/AlbumListRow.js";
import ArtistCard from "./rows/ArtistCard.js";
import ArtistRow from "./rows/ArtistRow.js";
import FileCard from "./rows/FileCard.js";
import FileRow from "./rows/FileRow.js";
import FolderCard from "./rows/FolderCard.js";
import FolderRow from "./rows/FolderRow.js";
import TrackRow from "./rows/TrackRow.js";

export default defineComponent({
  name: "EntityListHost",
  components: {
    AlbumCard,
    AlbumListRow,
    ArtistCard,
    ArtistRow,
    FileCard,
    FileRow,
    FolderCard,
    FolderRow,
    TrackRow,
  },
  props: {
    /** Discriminated body from loaders / downloads adapter. */
    body: { type: Object, required: true },
    error: { type: String, default: "" },
    loading: { type: Boolean, default: false },
    isGrid: { type: Boolean, default: false },
    gridHost: { type: Boolean, default: false },
    /** Track download icons (false on downloads library). */
    showTrackDownload: { type: Boolean, default: true },
    /**
     * Optional cover resolvers: (entity) => string
     * @type {((a: object) => string)|null}
     */
    artistCover: { type: Function, default: null },
    albumCover: { type: Function, default: null },
    trackCover: { type: Function, default: null },
    /** Folder multi-select (online library). */
    isSelected: { type: Function, default: null },
  },
  emits: [
    "open-artist",
    "open-album",
    "open-folder",
    "select-folder",
    "select-file",
  ],
  setup(props, { emit }) {
    function artistSrc(artist) {
      return props.artistCover ? props.artistCover(artist) : "";
    }
    function albumSrc(album) {
      return props.albumCover ? props.albumCover(album) : "";
    }
    function trackSrc(track) {
      return props.trackCover ? props.trackCover(track) : "";
    }
    function selected(path) {
      return props.isSelected ? props.isSelected(path) : false;
    }
    function openArtist(a) {
      emit("open-artist", a);
    }
    function openAlbum(a) {
      emit("open-album", a);
    }
    function openFolder(d) {
      emit("open-folder", d);
    }
    function selectFolder(d) {
      emit("select-folder", d);
    }
    function selectFile(f) {
      emit("select-file", f);
    }
    return {
      artistSrc,
      albumSrc,
      trackSrc,
      selected,
      openArtist,
      openAlbum,
      openFolder,
      selectFolder,
      selectFile,
    };
  },
  template: `
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
  `,
});
