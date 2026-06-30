import { useState, useEffect } from 'react'

export interface Annotation {
  id: string
  lat: number
  lng: number
  title: string
  color: string
}

export const ANNO_COLORS = ['#0dcc88', '#e8722a', '#3b9eff', '#f0b429', '#ff4d6d']

export function useAnnotations(storageKey: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(annotations))
  }, [annotations, storageKey])

  const addAnnotation = (ann: Omit<Annotation, 'id'>) =>
    setAnnotations(p => [...p, { ...ann, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }])

  const removeAnnotation = (id: string) =>
    setAnnotations(p => p.filter(a => a.id !== id))

  return { annotations, addAnnotation, removeAnnotation }
}
