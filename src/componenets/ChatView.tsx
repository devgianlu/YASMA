import React, {FunctionComponent, useCallback, useContext, useEffect, useState} from 'react'
import {HomepageContext} from '../pages/HomepageContext'
import {Chat} from '../types'
import {Button, Form, InputGroup} from 'react-bootstrap'
import {getChat, sendChatMessage} from '../p2p'

const ChatBody: FunctionComponent<{ chat: Chat }> = ({chat}) => {


	return <>{JSON.stringify(chat)}</>
}

const ChatComposeMessage: FunctionComponent<{ send: (text: string) => void }> = ({send}) => {
	const [text, setText] = useState('')

	return (
		<InputGroup>
			<Form.Control
				placeholder="Message"
				onChange={(ev) => setText(ev.target.value)}
			/>
			<Button variant="outline-secondary" onClick={() => {
				if (!text.trim())
					return

				send(text.trim())
				setText('')
			}}>
				Send
			</Button>
		</InputGroup>
	)
}

const ChatView: FunctionComponent = () => {
	const ctx = useContext(HomepageContext)
	const [chat, setChat] = useState<Chat>()

	useEffect(() => {
		if (!ctx.current) {
			setChat(undefined)
			return
		}

		getChat(ctx.current.peer).then(setChat)
	}, [ctx.current])

	const send = useCallback((text: string) => {
		if (!chat)
			return

		sendChatMessage(chat.peer, text)
	}, [chat])

	return (
		<div>
			{!chat && <>Nothing selected</>}
			{chat && (<>
				<ChatBody chat={chat}/>
				<ChatComposeMessage send={send}/>
			</>)}
		</div>
	)
}

export default ChatView