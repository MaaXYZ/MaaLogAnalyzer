import type { ShallowUnwrapRef } from 'vue'
import type { DynamicScrollerExposed } from 'vue-virtual-scroller'

/**
 * Public instance type exposed by the Vue `DynamicScroller` component.
 *
 * The upstream `DynamicScrollerExposed` keeps `Ref` wrappers; Vue component
 * instances unwrap those refs, so this alias matches the actual ref/emitter
 * shape in the template.
 */
export type DynamicScrollerInstance = ShallowUnwrapRef<DynamicScrollerExposed>
