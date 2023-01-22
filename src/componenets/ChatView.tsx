import React, {FunctionComponent, useCallback, useContext, useEffect, useRef, useState} from 'react'
import {HomepageContext} from '../pages/homapage/context'
import {Chat, ChatMessage} from '../types'
import {Button, Container, Form, InputGroup} from 'react-bootstrap'
import {sendChatMessage} from '../p2p'
import db from '../p2p/db'
import moment from 'moment'

const ChatHeader: FunctionComponent<{ chat: Chat }> = ({chat}) => {
	return (
		<div className="d-flex bg-dark align-items-center px-3 py-1">
			<h2 className="text-white me-3">{chat.username}</h2>
			<span className="text-muted">{chat.peer.replace('yasma_', '')}</span>
		</div>
	)
}

const ChatMessage: FunctionComponent<{ msg: ChatMessage, readLine: boolean }> = ({msg, readLine}) => {
	const classes = []
	if (msg.own) classes.push('text-end')
	else classes.push('text-start')
	if (readLine) classes.push('border-top border-primary')

	return (<div className={classes.join(' ')}>
		<div className="mb-0 lh-sm text-wrap text-break">{msg.text}</div>
		<small className="text-muted">{moment(msg.time).fromNow()}</small>
	</div>)
}

const ChatBody: FunctionComponent<{ chat: Chat }> = ({chat}) => {
	const lastElemRef = useRef<HTMLDivElement|null>()

	useEffect(() => {
		lastElemRef.current?.scrollIntoView()
	}, [])

	let readLine = false
	return (
		<div style={{height: 0}} className="overflow-auto flex-grow-1 my-2">
			<Container className="d-flex flex-column gap-2">
				{chat.messages.map(x => {
					const elem = <ChatMessage key={x.id} msg={x} readLine={!x.read && !readLine}/>
					if (!x.read) readLine = true
					return elem
				})}
				<div ref={lastElemRef}></div>
			</Container>
		</div>
	)
}

const ChatComposeMessage: FunctionComponent<{ send: (text: string) => void }> = ({send}) => {
	const [text, setText] = useState('')

	return (
		<InputGroup className="mb-3 px-3">
			<Form.Control
				placeholder="Message"
				value={text}
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

		db.getChat(ctx.current.peer).then(setChat)
	}, [ctx.current])

	const send = useCallback((text: string) => {
		if (!chat)
			return

		sendChatMessage(chat.peer, text)
	}, [chat])

	return (
		<div className="h-100 d-flex flex-column">
			{!chat && <h4 className="m-auto text-muted">Nothing selected</h4>}
			{chat && (<>
				<ChatHeader chat={chat}/>
				<ChatBody chat={chat}/>
				<ChatComposeMessage send={send}/>
			</>)}
		</div>
	)
}

export default ChatView