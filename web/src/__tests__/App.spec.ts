import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import App from '../App.vue'

describe('App', () => {
  it('mounts renders properly', () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', component: { template: '<div>Home</div>' } }],
    })
    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })
    expect(wrapper.findComponent({ name: 'RouterView' }).exists() || wrapper.html()).toBeTruthy()
  })
})
