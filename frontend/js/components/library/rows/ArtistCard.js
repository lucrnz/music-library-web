/** Grid card for an artist (image + name + counts). */
import { computed, defineComponent } from "vue";
import { artistImageUrl } from "../../../api.js";

export default defineComponent({
  name: "ArtistCard",
  props: {
    artist: { type: Object, required: true },
    /** Override cover (local OPFS). */
    coverSrc: { type: String, default: "" },
    /** When false, hide the album/track count subtitle. */
    showCounts: { type: Boolean, default: true },
  },
  emits: ["open"],
  setup(props, { emit }) {
    const cover = computed(
      () => props.coverSrc || artistImageUrl(props.artist, "thumb", false)
    );
    const sub = computed(() => {
      if (!props.showCounts) return "";
      const a = props.artist;
      const n = a.album_count;
      const albums = `${n} album${n === 1 ? "" : "s"}`;
      return `${albums} · ${a.track_count} tracks`;
    });
    function onClick() {
      emit("open", props.artist);
    }
    return { cover, sub, onClick };
  },
  template: `
    <button type="button" class="media-card" @click="onClick">
      <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
      <span class="media-card-title">{{ artist.name }}</span>
      <span v-if="sub" class="media-card-sub">{{ sub }}</span>
    </button>
  `,
});
