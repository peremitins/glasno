# Аудит смысловых дублей frontend-v1

Исходных записей: 600.
Удалено смысловых дублей: 214.
Осталось канонических вопросов: 386.

## frontend_angular_005_template_driven_vs_reactive_forms

Контекст: angular/middle.
Удалены: frontend_angular_007_forms_when_reactive_vs_template.
Причина: Один и тот же выбор между template-driven и reactive forms.

## frontend_angular_008_rxjs_subjects_cold_hot_and_variants

Контекст: angular/middle.
Удалены: frontend_angular_016_rxjs_cold_hot_and_subjects.
Причина: Один и тот же разбор Observable/Subject и BehaviorSubject/ReplaySubject.

## frontend_angular_018_signals_basics_and_cd

Контекст: angular/middle.
Удалены: frontend_angular_026_signals_basics_explain_and_example, frontend_angular_032_signals_in_angular.
Причина: Один базовый вопрос про Signals: что это, computed/effect и отличие от Observable.

## frontend_angular_020_forms_dynamic_formarray

Контекст: angular/middle.
Удалены: frontend_angular_014_reactive_forms_formarray_example.
Причина: Один и тот же вопрос про FormArray и динамические поля.

## frontend_angular_022_testing_standalone_with_testbed

Контекст: angular/middle.
Удалены: frontend_angular_041_testing_standalone_components_testbed.
Причина: Один и тот же тест standalone-компонента через TestBed.

## frontend_angular_049_onpush_change_detection

Контекст: angular/middle.
Удалены: frontend_angular_028_change_detection_onpush_practical, frontend_angular_040_change_detection_onpush_and_manual, frontend_angular_043_change_detection_onpush_troubleshooting.
Причина: Один и тот же вопрос про OnPush и принудительное обновление шаблона.

## frontend_angular_051_di_providedin_and_scopes

Контекст: angular/middle.
Удалены: frontend_angular_042_di_hierarchical_injectors, frontend_angular_053_di_provider_scopes_and_lifecycles, frontend_angular_055_dependency_injection_hierarchy.
Причина: Один и тот же вопрос про scope сервиса и иерархию провайдеров.

## frontend_engineering_008_testing_types_e2e_integration_unit

Контекст: none/junior.
Удалены: frontend_engineering_001_unit_vs_integration_tests_react, frontend_engineering_011_unit_vs_e2e_testing, frontend_engineering_021_test_types_and_purpose.
Причина: Одинаково про уровни тестирования и выбор между unit, integration и E2E

## frontend_engineering_010_semantic_html_aria_rules

Контекст: none/junior.
Удалены: frontend_engineering_003_aria_use_and_misuse.
Причина: Один вопрос про семантику вместо ARIA и риски неправильного использования

## frontend_engineering_042_accessibility_keyboard_navigation

Контекст: none/junior.
Удалены: frontend_engineering_006_semantic_html_and_aria, frontend_engineering_007_basic_accessibility_practices.
Причина: О базовых приёмах доступности: семантика, фокус, ARIA, alt, контраст

## frontend_web_platform_005_semantic_html

Контекст: none/junior.
Удалены: frontend_web_platform_001_html_semantics_header_main_section, frontend_web_platform_003_semantic_html_tags, frontend_web_platform_013_semantic_html_accessibility.
Причина: Про семантическую разметку, структуру страницы и пользу для a11y/SEO

## frontend_engineering_002_xss_basics_and_protection

Контекст: none/junior.
Удалены: frontend_web_platform_067_xss_prevention_and_innerhtml_dangers.
Причина: О XSS и базовой защите от внедрения HTML/JS

## frontend_javascript_007_loose_equality_and_type_coercion

Контекст: none/junior.
Удалены: frontend_javascript_014_equality_and_type_coercion, frontend_javascript_053_equality_and_type_coercion.
Причина: Одинаково про ==, === и приведение типов

## frontend_javascript_008_js_types_typeof

Контекст: none/junior.
Удалены: frontend_javascript_006_typeof_null_and_array_detection.
Причина: О typeof null и надёжной проверке массива/типа

## frontend_typescript_003_unknown_vs_any_vs_never_void

Контекст: none/junior.
Удалены: frontend_typescript_004_any_vs_unknown, frontend_typescript_015_unknown_vs_any, frontend_typescript_018_any_vs_unknown_vs_never_void.
Причина: Про any/unknown и специальные типы void/never

## frontend_typescript_031_tsconfig_key_options

Контекст: none/junior.
Удалены: frontend_typescript_012_compiler_options_strict_nulls_and_noimplicitany.
Причина: О настройках tsconfig и влиянии strict-флагов

## frontend_typescript_005_strictnullchecks_effect

Контекст: none/junior.
Удалены: frontend_typescript_024_nullability_strictnullchecks.
Причина: О strictNullChecks и работе с null/undefined

## frontend_typescript_007_generics_basics_identity

Контекст: none/junior.
Удалены: frontend_typescript_009_generic_identity, frontend_typescript_013_generics_basic_identity.
Причина: О generic identity и выводе типа при вызове

## frontend_typescript_019_generic_constraints_extends

Контекст: none/junior.
Удалены: frontend_typescript_027_generic_constraints_length, frontend_typescript_034_generics_identity_and_constraints.
Причина: Про ограничение generic через extends, меняется только пример

## frontend_typescript_043_generic_constraints_keyof

Контекст: none/junior.
Удалены: frontend_typescript_035_keyof_and_generic_constraints, frontend_typescript_048_generic_pluck_function.
Причина: О keyof и ограничении ключа через K extends keyof T

## frontend_typescript_021_utility_types_partial_pick_omit

Контекст: none/junior.
Удалены: frontend_typescript_010_pick_vs_omit.
Причина: Про Pick/Omit/Partial как способы выбирать и менять свойства

## frontend_typescript_022_mapped_types_basic

Контекст: none/junior.
Удалены: frontend_typescript_028_mapped_types_partial.
Причина: О mapped types и реализации Partial/readonly через keyof

## frontend_typescript_011_type_inference_variables_and_functions

Контекст: none/junior.
Удалены: frontend_typescript_023_type_inference_functions.
Причина: О выводе типов для функций и когда нужна явная аннотация

## frontend_typescript_042_discriminated_union_exhaustiveness

Контекст: none/junior.
Удалены: frontend_typescript_017_discriminated_union_pattern, frontend_typescript_026_discriminated_union, frontend_typescript_032_discriminated_union_narrowing.
Причина: О discriminated union, narrowing по тэгу и exhaustive check

## frontend_typescript_041_user_defined_type_guard

Контекст: none/junior.
Удалены: frontend_typescript_016_union_narrowing_methods.
Причина: Про user-defined type guard и сужение типа через предикат

## frontend_javascript_091_iterators_and_generators

Контекст: none/junior.
Удалены: frontend_javascript_075_iterators_generators, frontend_javascript_082_iterators_and_generators, frontend_javascript_093_custom_iterator_and_symbol_iterator_live, frontend_javascript_097_symbol_and_iterators_symbol_iterator.
Причина: О протоколе итерации, generator function и for...of

## frontend_javascript_079_closures_and_lexical_scope

Контекст: none/junior.
Удалены: frontend_javascript_025_closures_capturing_variables, frontend_javascript_045_closures_private_state, frontend_javascript_056_closure_basic_live_code, frontend_javascript_065_closure_counter_live_coding, frontend_javascript_072_closures_memory_capture.
Причина: О замыкании как захвате лексического окружения и приватном состоянии

## frontend_javascript_096_prototype_chain_and_method_lookup

Контекст: none/junior.
Удалены: frontend_javascript_031_prototype_chain_lookup, frontend_javascript_038_prototype_chain_vs_function_prototype.
Причина: О поиске по цепочке прототипов и различии prototype/__proto__

## frontend_javascript_039_es6_classes_vs_constructors

Контекст: none/junior.
Удалены: frontend_javascript_032_classes_vs_prototypes, frontend_javascript_047_classes_sugar_over_prototypes.
Причина: О class как синтаксическом сахаре над прототипами и super

## frontend_javascript_071_this_binding

Контекст: none/junior.
Удалены: frontend_javascript_063_arrow_vs_function_this.
Причина: Про правила this, включая arrow, call/apply/bind и new

## frontend_web_platform_028_event_delegation_and_propagation

Контекст: none/junior.
Удалены: frontend_web_platform_011_event_bubbling_and_capturing, frontend_web_platform_017_event_delegation_live_coding, frontend_web_platform_024_event_delegation_pattern, frontend_web_platform_037_event_delegation_and_propagation, frontend_web_platform_061_dom_event_delegation_and_phases.
Причина: Про capture/bubble и делегирование событий

## frontend_web_platform_051_css_specificity

Контекст: none/junior.
Удалены: frontend_web_platform_010_css_specificity_rules, frontend_web_platform_027_css_specificity, frontend_web_platform_044_css_specificity.
Причина: О специфичности и разрешении конфликтов стилей

## frontend_engineering_092_release_strategies_frontend

Контекст: none/senior.
Удалены: frontend_engineering_018_release_strategies_frontend, frontend_engineering_028_release_strategies_and_risk_mitigation, frontend_engineering_067_release_strategies_feature_flags_canary, frontend_engineering_077_safe_release_canary_feature_flags.
Причина: Одинаковая тема: безопасный релиз фронтенда через фича-флаги, canary/blue-green и быстрый откат.

## frontend_engineering_085_ci_pipeline_frontend_design

Контекст: none/senior.
Удалены: frontend_engineering_054_ci_pipeline_frontend_basics.
Причина: Один и тот же вопрос про состав и этапы CI-пайплайна для фронтенда.

## frontend_interview_practice_026_ci_cd_frontend_pipeline_design

Контекст: none/senior.
Удалены: frontend_interview_practice_019_ci_cd_cache_busting_frontend.
Причина: Одинаковый CI/CD-процесс с атомарным релизом, кешем CDN и откатом.

## frontend_engineering_023_frontend_observability_practices

Контекст: none/senior.
Удалены: frontend_engineering_046_frontend_observability_rum.
Причина: Одинаковая RUM/observability-диагностика: какие данные собирать с клиента для разбора инцидентов.

## frontend_engineering_071_frontend_tracing_request_context

Контекст: none/senior.
Удалены: frontend_engineering_075_rum_and_tracing_frontend_instrumentation.
Причина: Один и тот же distributed tracing между фронтом и бэком с передачей trace-контекста.

## frontend_engineering_073_design_system_tokens_and_versioning

Контекст: none/senior.
Удалены: frontend_engineering_087_design_system_component_library_structure.
Причина: Одна и та же архитектура дизайн-системы: токены, компоненты, версии и процессы поддержки.

## frontend_engineering_094_design_system_component_versioning

Контекст: none/senior.
Удалены: frontend_engineering_079_design_system_versioning_and_compat, frontend_engineering_091_component_library_change_process.
Причина: Одинаковое управление версионированием и изменениями в дизайн-системе без поломки потребителей.

## frontend_engineering_086_monorepo_vs_multirepo

Контекст: none/senior.
Удалены: frontend_engineering_081_monorepo_vs_multirepo_choice.
Причина: Один и тот же выбор между монорепозиторием и несколькими репозиториями с оценкой последствий.

## frontend_engineering_088_micro_frontends_tradeoffs

Контекст: none/senior.
Удалены: frontend_engineering_063_micro_frontends_tradeoffs, frontend_engineering_093_microfrontends_tradeoffs.
Причина: Одинаковый вопрос: когда нужны микрофронтенды и какие у них компромиссы.

## frontend_interview_practice_050_frontend_architecture_microfrontends

Контекст: none/senior.
Удалены: frontend_engineering_089_microfrontends_architecture, frontend_interview_practice_045_frontend_modularity_at_scale, frontend_interview_practice_048_microfrontends_architecture.
Причина: Одна и та же архитектура микрофронтендов для большого продукта: интеграция, общие зависимости, деплой и риски.

## frontend_interview_practice_046_offline_pwa_sync_conflict_resolution

Контекст: none/senior.
Удалены: frontend_interview_practice_044_pwa_offline_sync_conflicts.
Причина: Одинаковая PWA/offline-синхронизация с очередью изменений и разрешением конфликтов.

## frontend_web_platform_085_service_worker_fetch_and_strategies

Контекст: none/senior.
Удалены: frontend_web_platform_080_service_worker_offline_strategy.
Причина: Одинаковая стратегия Service Worker для кэша, обновлений и устаревания кеша.

## frontend_interview_practice_030_performance_fcp_hydration_optimisation

Контекст: none/senior.
Удалены: frontend_engineering_080_code_splitting_ssr_hydration_costs.
Причина: Один и тот же набор решений для SSR/гидратации и ускорения загрузки фронтенда.

## frontend_react_002_components_functional_vs_class

Контекст: react/junior.
Удалены: frontend_react_001_functional_vs_class_components, frontend_react_004_component_types_functional_vs_class.
Причина: Одна тема: функциональные и классовые компоненты в React и выбор между ними

## frontend_react_005_forms_controlled_vs_uncontrolled

Контекст: react/junior.
Удалены: frontend_react_012_forms_controlled_vs_uncontrolled.
Причина: Одинаковый смысл: контролируемые и неконтролируемые формы, когда нужен uncontrolled

## frontend_react_009_refs_useref_vs_createref

Контекст: react/junior.
Удалены: frontend_react_007_refs_dom_vs_mutable_container.
Причина: Один концепт: ref/useRef/createRef, доступ к DOM и хранение мутируемых значений

## frontend_react_010_reconciliation_keys

Контекст: react/junior.
Удалены: frontend_react_014_reconciliation_and_keys_in_lists.
Причина: Одинаковый вопрос про key в списках и проблему индекса как key

## frontend_react_023_state_batching_and_functional_updates

Контекст: react/junior.
Удалены: frontend_react_031_state_setter_batching, frontend_react_038_state_updates_batching_and_stale_closure.
Причина: Один смысл: batching setState и обновление от предыдущего значения

## frontend_react_024_useeffect_dependencies_and_cleanup

Контекст: react/junior.
Удалены: frontend_react_032_effects_deps_and_cleanup, frontend_react_039_useeffect_dependencies_and_cleanup.
Причина: Один смысл: зависимости useEffect и cleanup

## frontend_react_008_controlled_vs_uncontrolled_forms

Контекст: react/middle.
Удалены: frontend_react_026_forms_controlled_vs_uncontrolled.
Причина: Один и тот же выбор между controlled и uncontrolled формами

## frontend_react_043_forward_ref_and_useimperativehandle

Контекст: react/middle.
Удалены: frontend_react_044_refs_forwardref_useimperativehandle.
Причина: Один и тот же кейс с forwardRef и useImperativeHandle для публичного imperative API

## frontend_react_046_reconciliation_keys_and_list_updates

Контекст: react/middle.
Удалены: frontend_react_015_reconciliation_keys_list_rendering.
Причина: Один и тот же вопрос про key в списках и проблемы с index-as-key

## frontend_react_040_context_vs_prop_drilling

Контекст: react/middle.
Удалены: frontend_react_018_react_context_usage_and_performance, frontend_react_049_context_minimize_rerenders, frontend_react_053_context_performance_issues.
Причина: Один и тот же вопрос про Context вместо пропсов и борьбу с лишними ререндерами

## frontend_react_021_memoization_and_overuse_of_usememo

Контекст: react/middle.
Удалены: frontend_react_027_memo_usememo_usecallback_when_to_use, frontend_react_035_usememo_usecallback_misuse, frontend_react_041_performance_memoization_memo_callback_memo.
Причина: Одна и та же тема про пользу и вред React.memo, useMemo и useCallback

## frontend_react_022_testing_async_effects_and_mocking_fetch

Контекст: react/middle.
Удалены: frontend_react_036_testing_async_effects_and_act, frontend_react_042_testing_async_components_and_act, frontend_react_045_testing_async_effects_with_testing_library.
Причина: Один и тот же способ тестировать async fetch-эффекты с моками и ожиданием обновления UI

## frontend_react_057_concurrent_starttransition_and_ui_updates

Контекст: react/middle.
Удалены: frontend_react_047_usetransition_and_starttransition, frontend_react_051_start_transition_and_prioritization, frontend_react_054_transitions_starttransition_usage.
Причина: Один и тот же вопрос про startTransition/useTransition и низкоприоритетные обновления

## frontend_react_034_suspense_for_code_and_data

Контекст: react/senior.
Удалены: frontend_react_050_suspense_for_data, frontend_react_059_suspense_data_fetching_throw_promise.
Причина: Один и тот же механизм Suspense: ожидание ресурса, fallback и ошибки; различие между кодом и данными не меняет сути ответа.

## frontend_react_048_hydration_mismatch_debugging

Контекст: react/senior.
Удалены: frontend_react_052_hydration_mismatch_debugging, frontend_react_055_hydration_mismatch_causes_and_debug, frontend_react_058_ssr_hydration_mismatch_debugging.
Причина: Одинаковые причины mismatch между HTML сервера и клиента и те же способы поиска и исправления.

## frontend_react_060_react_server_components_core_ideas

Контекст: react/senior.
Удалены: frontend_react_061_server_components_overview, frontend_react_064_react_server_components_overview, frontend_react_065_server_components_design_client_boundary.
Причина: Один концепт RSC: что рендерится на сервере, чем это отличается от клиентских компонентов и как выбирать границу.

## frontend_vue_001_ref_vs_reactive

Контекст: vue/junior.
Удалены: frontend_vue_002_ref_vs_reactive_choice, frontend_vue_008_ref_vs_reactive, frontend_vue_051_ref_vs_reactive_difference.
Причина: Один и тот же выбор между ref и reactive, только с разными примерами и нюансами.

## frontend_vue_010_script_setup_vs_setup_function

Контекст: vue/junior.
Удалены: frontend_vue_004_script_setup_defineprops_defineemits, frontend_vue_050_script_setup_benefits.
Причина: Один и тот же вопрос о script setup и его отличиях от обычного setup.

## frontend_vue_012_pinia_store_basics

Контекст: vue/junior.
Удалены: frontend_vue_007_pinia_store_basics.
Причина: Один и тот же базовый вопрос о создании store в Pinia и использовании state/actions.

## frontend_vue_036_lifecycle_hooks_order_and_use

Контекст: vue/junior.
Удалены: frontend_vue_005_lifecycle_hooks_composition_order, frontend_vue_016_lifecycle_hooks_in_setup, frontend_vue_019_setup_lifecycle_timing, frontend_vue_027_lifecycle_hooks_composition_api.
Причина: Один и тот же порядок lifecycle-хуков и момент выполнения setup перед mount.

## frontend_vue_064_provide_inject_reactivity

Контекст: vue/junior.
Удалены: frontend_vue_028_provide_inject_reactivity, frontend_vue_035_provide_inject_reactivity_caveats.
Причина: Одна и та же реактивность при provide/inject и передаче состояния вниз.

## frontend_vue_052_watch_vs_watcheffect

Контекст: vue/junior.
Удалены: frontend_vue_026_watch_vs_watcheffect, frontend_vue_034_watch_vs_watcheffect.
Причина: Одна и та же разница между watch и watchEffect.

## frontend_vue_055_vite_hmr_and_build_differences

Контекст: vue/middle.
Удалены: frontend_vue_015_vite_dev_hmr_vs_production_build, frontend_vue_032_vite_hmr_and_build_differences.
Причина: Оба про различия dev/build в Vite и причины расхождений между режимами.

## frontend_vue_046_vue_router_navigation_guards_async

Контекст: vue/middle.
Удалены: frontend_vue_031_vue_router_guards_and_navigation.
Причина: Оба про navigation guards, проверку доступа и асинхронные редиректы.

## frontend_vue_040_testing_with_vue_test_utils_and_vitest

Контекст: vue/middle.
Удалены: frontend_vue_024_unit_testing_composition_api.
Причина: Оба про unit-тестирование Vue-компонента с моками зависимостей и выбор mount/shallowMount.

## frontend_vue_074_pinia_ssr_hydration

Контекст: vue/middle.
Удалены: frontend_vue_057_pinia_ssr_hydration, frontend_vue_063_pinia_ssr_hydration.
Причина: Оба про гидратацию Pinia в SSR и предотвращение рассинхронизации между сервером и клиентом.

## frontend_vue_056_suspense_and_async_setup

Контекст: vue/middle.
Удалены: frontend_vue_060_async_setup_and_suspense.
Причина: Оба про async setup, Suspense и SSR-ограничения при асинхронной инициализации.

## frontend_vue_072_nuxt_ssr_hydration_mismatch_causes

Контекст: vue/senior.
Удалены: frontend_vue_070_nuxt_ssr_hydration_mismatch_debugging, frontend_vue_071_nuxt_ssr_hydration_mismatch.
Причина: Одинаковый вопрос про причины hydration mismatch в Nuxt и способы диагностики/исправления.

## frontend_interview_practice_001_implement_debounce

Контекст: none/middle/interview_practice.
Удалены: frontend_interview_practice_002_debounce.
Причина: тот же debounce: реализация, leading/trailing и отмена; пример с input не меняет глубину

## frontend_interview_practice_014_perf_production_bottleneck

Контекст: none/middle/interview_practice.
Удалены: frontend_interview_practice_022_performance_optimisation_case.
Причина: тот же кейс про оптимизацию производительности: измерения, инструменты и компромиссы

## frontend_javascript_011_type_coercion_and_equality

Контекст: none/middle/javascript.
Удалены: frontend_javascript_009_type_coercion_equality, frontend_javascript_018_equality_and_type_coercion.
Причина: Одинаково про == и ===, различие только в примерах.

## frontend_javascript_015_to_primitive_valueof_tostring

Контекст: none/middle/javascript.
Удалены: frontend_javascript_078_type_coercion_to_primitive.
Причина: Один и тот же ToPrimitive: valueOf, toString и Symbol.toPrimitive.

## frontend_javascript_058_class_syntax_vs_constructor_functions

Контекст: none/middle/javascript.
Удалены: frontend_javascript_026_classes_syntax_vs_prototype_under_the_hood, frontend_javascript_099_classes_under_the_hood.
Причина: Один и тот же вопрос про class как синтаксический сахар над прототипами.

## frontend_javascript_067_map_set_weakmap_use_cases

Контекст: none/middle/javascript.
Удалены: frontend_javascript_027_collections_map_set_weakmap_weakset, frontend_javascript_048_maps_sets_and_weakmaps, frontend_javascript_074_collections_map_weakmap.
Причина: Одинаково про Map/Set вместо Object/Array и назначение WeakMap/WeakSet.

## frontend_javascript_041_modules_esm_vs_commonjs_dynamic_import

Контекст: none/middle/javascript.
Удалены: frontend_javascript_028_modules_esm_vs_commonjs_and_circular_deps, frontend_javascript_049_es_modules_vs_commonjs, frontend_javascript_085_esm_vs_commonjs, frontend_javascript_094_es_modules_vs_commonjs, frontend_javascript_098_es_modules_vs_commonjs, frontend_javascript_100_modules_esm_cjs.
Причина: Один и тот же разбор ESM и CommonJS: статичность, live bindings и циклы.

## frontend_javascript_068_promise_chaining_and_error_handling

Контекст: none/middle/javascript.
Удалены: frontend_javascript_029_promises_states_chaining_and_async_await.
Причина: Один и тот же разбор цепочек Promise и async/await.

## frontend_javascript_061_errors_async_handling_and_unhandled_rejection

Контекст: none/middle/javascript.
Удалены: frontend_javascript_042_error_handling_sync_async_unhandledrejection, frontend_javascript_069_async_error_propagation_unhandled_rejections, frontend_javascript_077_async_await_error_propagation.
Причина: Один и тот же вопрос про try/catch, rejected promises и unhandledrejection.

## frontend_javascript_088_iterators_and_generators

Контекст: none/middle/javascript.
Удалены: frontend_javascript_034_iterator_protocol_and_generators.
Причина: Один и тот же протокол итераторов и генераторы.

## frontend_javascript_087_closures_definition_and_memory

Контекст: none/middle/javascript.
Удалены: frontend_javascript_030_closures_and_memory.
Причина: Один и тот же вопрос про замыкания и удержание памяти.

## frontend_javascript_101_memory_leaks_patterns

Контекст: none/middle/javascript.
Удалены: frontend_javascript_092_memory_leaks_in_browser, frontend_javascript_095_memory_leaks_and_weak_references, frontend_javascript_103_memory_management_gc_and_memory_leaks, frontend_javascript_109_memory_leaks_closures_and_event_listeners.
Причина: Одинаково про утечки памяти в браузере и их поиск через профилирование.

## frontend_typescript_038_modules_default_vs_named_esmoduleinterop

Контекст: none/middle/typescript.
Удалены: frontend_typescript_030_modules_exports_imports.
Причина: Оба про default/named export и импорт CommonJS; ответ по сути одинаковый.

## frontend_typescript_051_declaration_files_declare_module_and_global

Контекст: none/middle/typescript.
Удалены: frontend_typescript_029_declaration_files_d_ts, frontend_typescript_045_d_ts_when_and_how, frontend_typescript_057_declaration_files_and_ambient_declarations.
Причина: Все три спрашивают про назначение .d.ts и объявление через declare module / declare global.

## frontend_typescript_052_conditional_types_distribution

Контекст: none/middle/typescript.
Удалены: frontend_typescript_050_conditional_types_distributive_behavior, frontend_typescript_055_conditional_types_distribution, frontend_typescript_058_conditional_types_distributive_behavior.
Причина: Один и тот же концепт: conditional types, дистрибутивность по union и способ её отключить.

## frontend_typescript_053_infer_in_conditional

Контекст: none/middle/typescript.
Удалены: frontend_typescript_062_infer_in_conditional_types, frontend_typescript_064_infer_in_conditional_types.
Причина: Один и тот же приём infer в conditional types для извлечения вложенного типа; отличается только пример.

## frontend_typescript_063_mapped_types_key_remapping_as

Контекст: none/middle/typescript.
Удалены: frontend_typescript_049_mapped_types_key_remapping_and_templates.
Причина: Оба про key remapping в mapped types через as и template literal types.

## frontend_engineering_005_cls_causes_and_mitigation

Контекст: none/middle/engineering.
Удалены: frontend_engineering_057_cls_improvement_core_web_vitals, frontend_engineering_061_reduce_cumulative_layout_shift.
Причина: Один и тот же вопрос про причины и исправление CLS.

## frontend_engineering_009_token_storage_auth_practices

Контекст: none/middle/engineering.
Удалены: frontend_engineering_017_token_storage_security_tradeoffs.
Причина: Один и тот же выбор localStorage/cookie и риски хранения токена.

## frontend_engineering_027_focus_management_in_components

Контекст: none/middle/engineering.
Удалены: frontend_engineering_062_a11y_focus_management_in_modal.
Причина: Один и тот же сценарий с фокусом в модалке и скрытием фона.

## frontend_engineering_030_unit_testing_mocks_strategy

Контекст: none/middle/engineering.
Удалены: frontend_engineering_012_unit_tests_mocking_shallow_vs_full_render.
Причина: Один и тот же вопрос про моки и изоляцию unit-тестов.

## frontend_engineering_031_ci_pipeline_tests_lint_build_deploy

Контекст: none/middle/engineering.
Удалены: frontend_engineering_014_ci_pipeline_quality_gates.
Причина: Один и тот же базовый CI-пайплайн перед мёрджем.

## frontend_engineering_034_core_web_vitals_lcp_inp_cls

Контекст: none/middle/engineering.
Удалены: frontend_engineering_025_core_web_vitals_causes, frontend_engineering_040_core_web_vitals_practices.
Причина: Один и тот же общий ответ про метрики CWV и типовые правки.

## frontend_engineering_036_state_management_choice

Контекст: none/middle/engineering.
Удалены: frontend_engineering_013_state_management_vs_prop_drilling, frontend_engineering_052_state_management_boundaries, frontend_engineering_082_state_management_scaling.
Причина: Один и тот же выбор между локальным и глобальным состоянием.

## frontend_engineering_037_code_splitting_lazy_loading

Контекст: none/middle/engineering.
Удалены: frontend_engineering_033_code_splitting_lazy_loading_tradeoffs.
Причина: Один и тот же вопрос про code splitting и lazy loading.

## frontend_engineering_047_diagnose_reduce_lcp

Контекст: none/middle/engineering.
Удалены: frontend_engineering_016_lcp_root_causes_and_fixes.
Причина: Один и тот же разбор причин и оптимизаций LCP.

## frontend_engineering_051_flaky_e2e_tests_reduction

Контекст: none/middle/engineering.
Удалены: frontend_engineering_022_flaky_tests_mitigation, frontend_engineering_038_flaky_tests_diagnostics.
Причина: Один и тот же разбор флейков в E2E/CI и их стабилизация.

## frontend_engineering_065_xss_prevention_and_csp

Контекст: none/middle/engineering.
Удалены: frontend_engineering_026_xss_and_csp_protection, frontend_engineering_035_xss_csp_prevention, frontend_engineering_041_xss_and_csp_mitigation, frontend_engineering_076_xss_prevention_csp_sanitization.
Причина: Один и тот же ответ про XSS и роль CSP.

## frontend_engineering_066_rum_vs_synthetic_monitoring

Контекст: none/middle/engineering.
Удалены: frontend_engineering_019_rum_vs_synthetic_monitoring.
Причина: Один и тот же выбор между RUM и синтетическим мониторингом.

## frontend_engineering_078_ci_build_caching_and_incremental

Контекст: none/middle/engineering.
Удалены: frontend_engineering_045_ci_build_speed_optimization, frontend_engineering_070_ci_pipeline_caching_and_speed.
Причина: Один и тот же набор приёмов для ускорения CI-сборки.

## frontend_engineering_083_critical_render_path_optimization

Контекст: none/middle/engineering.
Удалены: frontend_engineering_056_critical_rendering_path_optimization, frontend_engineering_072_critical_rendering_path_and_optimizations, frontend_engineering_090_critical_render_path_optimization.
Причина: Один и тот же критический путь рендеринга и его оптимизация.

## frontend_web_platform_016_html_forms_constraint_api

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_020_forms_native_validation.
Причина: Одинаково про нативную валидацию HTML-форм и Constraint Validation API.

## frontend_web_platform_033_cors_preflight_and_headers

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_040_cors_preflight_and_credentials, frontend_web_platform_062_cors_preflight_and_credentials.
Причина: Один и тот же CORS-preflight и credentials.

## frontend_web_platform_038_passive_event_listeners

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_025_passive_event_listeners_scroll_performance, frontend_web_platform_029_passive_event_listeners.
Причина: То же про passive:true, scroll/touch и запрет preventDefault.

## frontend_web_platform_036_dom_manipulation_performance

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_023_dom_manipulation_batching, frontend_web_platform_030_dom_manipulation_best_practices, frontend_web_platform_046_dom_manipulation_batching.
Причина: Одинаковые приёмы для массовых DOM-вставок и снижения reflow.

## frontend_web_platform_052_reflow_vs_repaint

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_022_reflow_repaint_compositing.
Причина: Оба про reflow/repaint/compositing после изменений DOM.

## frontend_web_platform_064_critical_rendering_path_resources

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_081_rendering_pipeline_critical_path, frontend_web_platform_083_critical_rendering_path.
Причина: Один и тот же critical rendering path и ускорение первой отрисовки.

## frontend_web_platform_074_rendering_pipeline_paint_composite

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_076_rendering_pipeline_reflow_paint.
Причина: Одинаковое описание рендеринг-пайплайна и его оптимизации.

## frontend_web_platform_050_cookies_security_attributes

Контекст: none/middle/web_platform.
Удалены: frontend_web_platform_065_cookies_attributes_vs_storage_security.
Причина: Одинаково про cookies vs Web Storage с упором на безопасность и серверный доступ.
