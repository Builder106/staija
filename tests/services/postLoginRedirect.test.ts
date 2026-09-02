import { describe, it, expect } from 'vitest'
import { postLoginRoute } from '../../src/services/postLoginRedirect'
import type { UserRole } from '../../src/services/types'

describe('postLoginRoute', () => {
  it('returns home for null', () => {
    expect(postLoginRoute(null)).toEqual({ name: 'home' })
  })

  it('returns home for undefined', () => {
    expect(postLoginRoute(undefined)).toEqual({ name: 'home' })
  })

  it('routes admin to /admin', () => {
    expect(postLoginRoute('admin')).toEqual({ path: '/admin' })
  })

  it('routes staff to /staff', () => {
    expect(postLoginRoute('staff')).toEqual({ path: '/staff' })
  })

  it('routes student to /learn', () => {
    expect(postLoginRoute('student')).toEqual({ path: '/learn' })
  })

  it('routes alumni to alumni-home', () => {
    expect(postLoginRoute('alumni')).toEqual({ name: 'alumni-home' })
  })

  it('routes mentor to mentor-dashboard', () => {
    expect(postLoginRoute('mentor')).toEqual({ name: 'mentor-dashboard' })
  })

  it('routes applicant to applicant-dashboard', () => {
    expect(postLoginRoute('applicant')).toEqual({ name: 'applicant-dashboard' })
  })

  it('covers every UserRole without falling through to home', () => {
    const roles: UserRole[] = ['admin', 'staff', 'student', 'alumni', 'mentor', 'applicant']
    for (const role of roles) {
      expect(postLoginRoute(role)).not.toEqual({ name: 'home' })
    }
  })

  it('falls back to home for unrecognized role', () => {
    expect(postLoginRoute('unknown' as UserRole)).toEqual({ name: 'home' })
  })
})

