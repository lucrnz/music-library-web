import { defineComponent } from "vue";

export default defineComponent({
  name: "Icon",
  props: {
    name: { type: String, required: true },
  },
  template: `
    <svg class="icon" aria-hidden="true">
      <use :href="'#i-' + name" />
    </svg>
  `,
});
