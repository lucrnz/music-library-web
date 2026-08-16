/** Album row (list, not grid card) — Search + library list layout. */
import { computed, defineComponent } from "vue";
import { coverUrl } from "../../../api.js";
import { kindForAlbum } from "../../../lossyKind.js";
import Icon from "../../icons/Icon.js";
import LossyMark from "../../lossy/LossyMark.js";

export default defineComponent({
  name: "AlbumListRow",
  components: { Icon, LossyMark },
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
      return `${a.artist || ""}${year} · ${a.trackCount ?? 0} tracks`;
    });
    const lossyKind = computed(() => kindForAlbum(props.album));
    function onClick(e) {
      if (e.target.closest(".lossy-mark")) return;
      emit("open", props.album);
    }
    return { cover, sub, lossyKind, onClick };
  },
  template: `
    <div class="row" @click="onClick">
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title-line">
          <span class="row-title">{{ album.title }}</span>
          <LossyMark :kind="lossyKind" />
        </span>
        <span class="row-sub">{{ sub }}</span>
      </span>
      <span class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
  `,
});
