/** Runs after React commits error attributes; does not discard the user's values. */
export function focusFirstInvalid(form: HTMLFormElement): void {
  window.setTimeout(() => {
    if (!form.isConnected) return
    const target = form.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (target) target.focus()
  }, 0)
}
