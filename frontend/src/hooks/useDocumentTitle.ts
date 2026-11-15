import { useEffect } from 'react'
import { APP_NAME } from '@/config/app'

export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
    const timer=window.setTimeout(()=>{
      const heading=document.querySelector<HTMLElement>('main h1')
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}
    },0)
    return ()=>window.clearTimeout(timer)
  }, [title])
}
