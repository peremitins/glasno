<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    ComboboxAnchor,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxPortal,
    ComboboxRoot,
    ComboboxViewport,
  } from 'reka-ui';
  import { CheckIcon, MagnifyingGlassIcon } from '@radix-icons/vue';
  import { PROFESSIONAL_ROLE_OPTIONS } from '@/shared/professionalRoles';
  import { resolveProfessionSelection } from '@/app/utils/interviewSource';

  interface RoleOption {
    role: string;
    specialization?: string;
    group: string;
    aliases?: string[];
    custom?: boolean;
  }

  const props = defineProps<{
    modelValue: string;
    id: string;
    label: string;
    placeholder?: string;
  }>();

  const emit = defineEmits<{
    'update:modelValue': [value: string];
  }>();

  const { t } = useI18n();

  const MAX_VISIBLE_ROLE_OPTIONS = 48;

  const roleOptions: RoleOption[] = PROFESSIONAL_ROLE_OPTIONS.map((role) => ({
    role: role.name,
    specialization: '',
    group: role.categoryName,
    aliases: role.aliases,
  }));

  const rolePickerOpen = ref(false);
  const rolePickerRequested = ref(false);
  const roleSearchTerm = ref('');
  const selectedRoleOption = ref<RoleOption | null>(null);

  // Пока меню открыто — показываем то, что печатает пользователь (searchTerm);
  // когда закрыто — зафиксированное значение поля. Так выбор из списка и свой
  // текст не затираются при потере фокуса.
  const roleInputValue = computed({
    get: () =>
      rolePickerOpen.value ? roleSearchTerm.value : props.modelValue,
    set: (value: string) => {
      roleSearchTerm.value = value;
      emit('update:modelValue', value);
      selectedRoleOption.value = null;
    },
  });

  // «Свой вариант» — если ввод не совпал точно с ролью из списка. Позволяет
  // зафиксировать любую должность, ссылку или описание как есть.
  const customRoleOption = computed<RoleOption | null>(() => {
    const role = roleSearchTerm.value.trim();
    if (role) {
      const exactMatch = roleOptions.some(
        (option) => option.role.toLowerCase() === role.toLowerCase()
      );
      if (exactMatch) return null;
    }

    return {
      role,
      specialization: role
        ? t('interview.new.roles.customHint')
        : t('interview.new.roles.customEmptyHint'),
      group: t('interview.new.roles.customGroup'),
      custom: true,
    };
  });

  const visibleRoleOptions = computed(() => {
    const query = roleSearchTerm.value.trim().toLowerCase();
    const options = query
      ? roleOptions.filter((item) =>
          `${item.role} ${item.group} ${(item.aliases ?? []).join(' ')}`
            .toLowerCase()
            .includes(query)
        )
      : roleOptions;
    return [
      ...options.slice(0, MAX_VISIBLE_ROLE_OPTIONS),
      customRoleOption.value,
    ].filter((option): option is RoleOption => Boolean(option));
  });

  function setRolePickerOpen(open: boolean) {
    if (open && !rolePickerRequested.value) return;
    rolePickerOpen.value = open;
    if (open) {
      roleSearchTerm.value = '';
      return;
    }
    rolePickerRequested.value = false;
    roleSearchTerm.value = '';
  }

  function openRolePicker() {
    rolePickerRequested.value = true;
    setRolePickerOpen(true);
  }

  async function focusRoleInput() {
    await nextTick();
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const focus = () => {
      rolePickerRequested.value = false;
      rolePickerOpen.value = false;
      document.getElementById(props.id)?.focus();
    };
    window.requestAnimationFrame(() => {
      focus();
      window.setTimeout(focus, 80);
    });
  }

  function selectRole(option: RoleOption) {
    const selection = resolveProfessionSelection(option);

    emit('update:modelValue', selection.role);
    selectedRoleOption.value = selection.selectedOption as RoleOption | null;
    roleSearchTerm.value = '';

    if (selection.keepPickerOpen) {
      rolePickerRequested.value = true;
      rolePickerOpen.value = true;
      return;
    }

    setRolePickerOpen(false);
    if (selection.focusInput) {
      void focusRoleInput();
    }
  }

  function selectRoleValue(value: unknown) {
    if (value && typeof value === 'object' && 'role' in value) {
      selectRole(value as RoleOption);
    }
  }
</script>

<template>
  <div class="field quick-source">
    <label :for="id">{{ label }}</label>
    <ComboboxRoot
      :model-value="selectedRoleOption"
      :open="rolePickerOpen"
      class="quick-source__combobox"
      :ignore-filter="true"
      @update:open="setRolePickerOpen"
      @update:model-value="selectRoleValue"
    >
      <ComboboxAnchor class="quick-source__anchor">
        <div class="input-shell">
          <MagnifyingGlassIcon aria-hidden="true" />
          <ComboboxInput
            :id="id"
            v-model="roleInputValue"
            class="text-control"
            autocomplete="off"
            :display-value="
              (value) =>
                value && typeof value === 'object' && 'role' in value
                  ? String(value.role)
                  : modelValue
            "
            :placeholder="placeholder"
            @click="openRolePicker"
          />
        </div>
      </ComboboxAnchor>

      <ComboboxPortal v-if="rolePickerRequested && rolePickerOpen">
        <ComboboxContent
          class="role-menu glass-frame glass-frame--soft"
          position="popper"
          side="bottom"
          align="start"
          :side-offset="8"
          :side-flip="true"
          :collision-padding="{ top: 12, right: 12, bottom: 24, left: 12 }"
        >
          <ComboboxViewport class="role-menu-viewport">
            <ComboboxItem
              v-for="option in visibleRoleOptions"
              :key="`${option.group}-${option.role}`"
              :value="option"
              class="role-option"
              :class="{ 'role-option--custom': option.custom }"
            >
              <span>
                <strong>
                  {{
                    option.custom && option.role
                      ? t('interview.new.roles.customAction', {
                          role: option.role,
                        })
                      : option.custom
                      ? t('interview.new.roles.customEmptyAction')
                      : option.role
                  }}
                </strong>
                <small>{{ option.group }}</small>
              </span>
              <CheckIcon
                v-if="selectedRoleOption?.role === option.role"
                class="role-option-check"
                aria-hidden="true"
              />
            </ComboboxItem>
            <ComboboxEmpty class="role-empty">
              {{ t('interview.new.emptyRoles') }}
            </ComboboxEmpty>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
    <p class="field-hint">{{ t('interview.new.roles.freeInputHint') }}</p>
  </div>
</template>

<style scoped>
  .field {
    display: grid;
    gap: 8px;
  }

  .field label {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 900;
  }

  .quick-source__combobox,
  .quick-source__anchor {
    display: block;
    min-width: 0;
  }

  .input-shell {
    position: relative;
  }

  .input-shell svg {
    position: absolute;
    top: 50%;
    left: 14px;
    z-index: 2;
    width: 17px;
    height: 17px;
    color: var(--text-secondary);
    transform: translateY(-50%);
  }

  .input-shell .text-control {
    padding-left: 42px;
  }

  .text-control {
    width: 100%;
    min-height: 52px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-primary);
    outline: 0;
    padding: 14px 15px;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .text-control::placeholder {
    color: var(--text-muted);
  }

  .text-control:focus {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
  }

  .field-hint {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.45;
  }

  .role-menu {
    z-index: 50;
    width: min(var(--reka-combobox-trigger-width, 520px), calc(100vw - 28px));
    max-height: min(
      var(--reka-combobox-content-available-height, 320px),
      320px
    );
    overflow: hidden;
    padding: 6px;
  }

  .role-menu-viewport {
    display: grid;
    gap: 3px;
    max-height: 304px;
    overflow-x: hidden;
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-color: var(--glass-border-strong) transparent;
    scrollbar-width: thin;
  }

  .role-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    outline: 0;
    padding: 8px 12px;
    text-align: left;
    user-select: none;
  }

  .role-option:hover,
  .role-option[data-highlighted] {
    background: var(--surface-raised);
  }

  .role-option--custom {
    border: 1px dashed var(--glass-border);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .role-option span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .role-option strong,
  .role-option small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-option small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .role-option-check {
    width: 16px;
    height: 16px;
    color: var(--accent-2);
  }

  .role-empty {
    padding: 16px 12px;
    color: var(--text-secondary);
    font-size: 13px;
  }
</style>

<style>
  /* Reka Combobox рендерит меню через Teleport за пределами scoped-дерева. */
  .role-menu {
    z-index: 80;
    width: min(
      var(--reka-combobox-trigger-width, 520px),
      calc(100vw - 28px)
    ) !important;
    max-height: min(
      var(--reka-combobox-content-available-height, 320px),
      calc(100dvh - 140px),
      320px
    ) !important;
    overflow: hidden !important;
    padding: 6px;
  }

  .role-menu-viewport {
    display: grid;
    gap: 3px;
    max-height: min(
      calc(var(--reka-combobox-content-available-height, 320px) - 16px),
      calc(100dvh - 156px),
      304px
    ) !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
    padding-right: 4px;
    scrollbar-color: var(--glass-border-strong) transparent;
    scrollbar-width: thin;
  }

  .role-menu .role-menu-viewport::-webkit-scrollbar {
    display: block !important;
    width: 6px;
  }

  .role-menu .role-menu-viewport::-webkit-scrollbar-track {
    background: transparent;
  }

  .role-menu .role-menu-viewport::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--glass-border-strong);
  }

  .role-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    outline: 0;
    padding: 8px 12px;
    text-align: left;
    user-select: none;
  }

  .role-option:hover,
  .role-option[data-highlighted] {
    background: var(--surface-raised);
  }

  .role-option--custom {
    border: 1px dashed var(--glass-border);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .role-option span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .role-option strong,
  .role-option small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-option small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .role-option-check {
    width: 16px;
    height: 16px;
    color: var(--accent-2);
  }

  .role-empty {
    padding: 16px 12px;
    color: var(--text-secondary);
    font-size: 13px;
  }
</style>
