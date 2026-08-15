import { computed, defineComponent } from "vue";
import { coverUrl } from "../../../api.js";
import { kindForAlbum } from "../../../lossyKind.js";
import LossyMark from "../../lossy/LossyMark.js";

export default defineComponent({
  name: "AlbumCard",
  components: { LossyMark },
  props: {
    album: { type: Object, required: true },
    coverSrc: { type: String, default: "" },
  },
  emits: ["open"],
  setup(props, { emit }) {
    const cover = computed(
      () =>
        props.coverSrc ||
        coverUrl({ albumId: props.album.id }, "thumb", false)
    );
    const sub = computed(() =>
      [props.album.artist, props.album.year].filter(Boolean).join(" · ")
    );
    const lossyKind = computed(() => kindForAlbum(props.album));
    function onClick() {
      emit("open", props.album);
    }
    return { cover, sub, lossyKind, onClick };
  },
  template: `
    <div class="media-card-wrap">
      <button type="button" class="media-card" @click="onClick">
        <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
        <span class="media-card-title">{{ album.title }}</span>
        <span class="media-card-sub">{{ sub }}</span>
      </button>
      <LossyMark class="media-card-lossy" :kind="lossyKind" />
    </div>
  `,
});
