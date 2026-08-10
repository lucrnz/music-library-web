/** Album row (list, not grid card) — Search + library list layout. */
import { computed, defineComponent } from "vue";
import { coverUrl } from "../../../api.js";
import Icon from "../../icons/Icon.js";

export default defineComponent({
  name: "AlbumListRow",
  components: { Icon },
  props: {
    album: { type: Object, required: true },
    /** Override cover (local OPFS). */
    coverSrc: { type: String, default: "" },
  },
  emits: ["open"],
  setup(props, { emit }) {
    const cover = computed(
      () =>
        props.coverSrc ||
        coverUrl({ albumId: props.album.id }, "thumb", false)
    );
    const sub = computed(() => {
      const a = props.album;
      const year = a.year ? ` · ${a.year}` : "";
      return `${a.artist || ""}${year} · ${a.track_count} tracks`;
    });
    function onClick() {
      emit("open", props.album);
    }
    return { cover, sub, onClick };
  },
  template: `
    <div class="row" @click="onClick">
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title">{{ album.title }}</span>
        <span class="row-sub">{{ sub }}</span>
      </span>
      <span class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
  `,
});
