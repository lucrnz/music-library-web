import { computed, defineComponent } from "vue";
import { artistImageUrl } from "../../../api.js";
import Icon from "../../icons/Icon.js";

export default defineComponent({
  name: "ArtistRow",
  components: { Icon },
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
    <div class="row" @click="onClick">
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title">{{ artist.name }}</span>
        <span v-if="sub" class="row-sub">{{ sub }}</span>
      </span>
      <span class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
  `,
});
