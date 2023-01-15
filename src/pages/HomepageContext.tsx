import * as React from 'react'
import {ChatItem} from '../types'

export const HomepageContext = React.createContext<{
	current?: ChatItem,
	setCurrent: (chat: ChatItem) => void
}>({
	current: undefined,
	setCurrent() {
		// stub
	},
})
