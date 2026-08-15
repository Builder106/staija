import { ref, watch, type Ref } from 'vue';

/**
 * Track whether a reactive form ref has diverged from its last
 * "clean" snapshot. Cheap deep-compare via JSON.stringify — fine for
 * the LMS editor forms (slug/title fields plus a rich-text Document of
 * a few KB at most).
 *
 * Call `markClean()` after the form is loaded from the server and
 * after every successful save: subsequent mutations flip `isDirty`
 * back to true.
 */
export function useFormDirty<T>(form: Ref<T>) {
  const isDirty = ref(false);
  let snapshot = JSON.stringify(form.value);

  watch(
    form,
    () => {
      isDirty.value = JSON.stringify(form.value) !== snapshot;
    },
    { deep: true }
  );

  function markClean() {
    snapshot = JSON.stringify(form.value);
    isDirty.value = false;
  }

  return { isDirty, markClean };
}
