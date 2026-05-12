export function normalizeText(value) {
  return String(value || "").trim();
}

export function clearChildren(element) {
  if (!element || typeof element.removeChild !== "function") {
    return;
  }

  if (element.firstChild) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    return;
  }

  const children = element.children;
  if (!children || typeof children.length !== "number") {
    return;
  }

  while (children.length > 0) {
    const firstChild = children[0] || (typeof children.item === "function" ? children.item(0) : null);
    if (!firstChild) {
      break;
    }
    element.removeChild(firstChild);
  }
}

function createFallbackOption() {
  return {
    value: "",
    textContent: "",
    disabled: false,
    selected: false
  };
}

export function replaceSelectOptions(options = {}) {
  const {
    selectEl = null,
    items = [],
    selectedValue = "",
    placeholder = null,
    createOption = createFallbackOption
  } = options;

  if (!selectEl || typeof selectEl.appendChild !== "function") {
    return;
  }

  clearChildren(selectEl);

  const appendOption = ({ value = "", label = "", disabled = false, selected = false } = {}) => {
    const option = typeof createOption === "function" ? createOption() : createFallbackOption();
    option.value = value;
    option.textContent = label;
    option.disabled = disabled === true;
    option.selected = selected === true;
    selectEl.appendChild(option);
    return option;
  };

  if (placeholder && typeof placeholder === "object") {
    appendOption({
      value: normalizeText(placeholder.value),
      label: String(placeholder.label || ""),
      disabled: placeholder.disabled === true,
      selected: !selectedValue || placeholder.selected === true
    });
  }

  for (const item of Array.isArray(items) ? items : []) {
    const value = normalizeText(item?.value);
    appendOption({
      value,
      label: String(item?.label || value),
      disabled: item?.disabled === true,
      selected: value === selectedValue
    });
  }

  if ("value" in selectEl) {
    selectEl.value = selectedValue || normalizeText(placeholder?.value);
  }
}

export function syncSelectionActionState(options = {}) {
  const {
    selectEl = null,
    selectedValue = "",
    itemCount = 0,
    controls = []
  } = options;

  const hasItems = Number.isInteger(itemCount) ? itemCount > 0 : Number(itemCount) > 0;
  if (selectEl) {
    selectEl.value = selectedValue;
    selectEl.disabled = !hasItems;
  }
  for (const control of Array.isArray(controls) ? controls : []) {
    if (control) {
      control.disabled = !hasItems;
    }
  }
  return hasItems;
}
