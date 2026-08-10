import { computed, defineComponent } from "vue";
import { coverUrl } from "../../../api.js";

export default defineComponent({
  name: "AlbumCard",
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
    function onClick() {
      emit("open", props.album);
    }
    return { cover, sub, onClick };
  },
  template: `
    <button type="button" class="album-card" @click="onClick">
      <img class="album-card-cover" :src="cover" alt="" loading="lazy" />
      <span class="album-card-title">{{ album.title }}</span>
      <span class="album-card-sub">{{ sub }}</span>
    </button>
  `,
});
