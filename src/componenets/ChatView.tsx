import React, {FunctionComponent, useCallback, useContext, useEffect, useRef, useState} from 'react'
import {HomepageContext} from '../pages/homapage/context'
import {Chat, ChatMessage} from '../types'
import {Button, Container, Form, InputGroup} from 'react-bootstrap'
import {sendChatMessage} from '../p2p'
import db, {ChatEvent, MessageEvent} from '../p2p/db'
import moment from 'moment'

const ChatHeader: FunctionComponent<{ chat: Chat }> = ({chat}) => {
	return (
		<div className="d-flex bg-dark align-items-center px-3 py-1">
			<h2 className="text-white me-3">{chat.username}</h2>
			<span className="text-muted">{chat.peer.replace('yasma_', '')}</span>
		</div>
	)
}

const ChatMessage: FunctionComponent<{
	msg: ChatMessage,
	readLine: boolean,
	unsent: boolean
}> = ({msg, readLine, unsent}) => {
	const classes = []
	if (msg.own) classes.push('text-end')
	else classes.push('text-start')
	if (readLine) classes.push('border-top border-primary')

	return (<div className={classes.join(' ')}>
		<div className={'mb-0 lh-sm text-wrap text-break' + (unsent ? ' text-danger' : '')}>{msg.text}</div>
		<small className="text-muted">{moment(msg.time).fromNow()}</small>
	</div>)
}

const ChatBody: FunctionComponent<{ chat: Chat }> = ({chat}) => {
	const lastElemRef = useRef<HTMLDivElement | null>()
	const [unsentMessages, setUnsentMessages] = useState<number[]>([])

	useEffect(() => {
		lastElemRef.current?.scrollIntoView()
		void db.resetUnreadMessages(chat.peer)
	}, [chat])

	useEffect(() => {
		const onChat = ({peer}: ChatEvent) => {
			if (peer !== chat.peer)
				return

			db.getUnsentMessages(chat.peer).then(x => setUnsentMessages(x.map(y => y.id)))
		}
		db.on('chat', onChat)

		db.getUnsentMessages(chat.peer).then(x => setUnsentMessages(x.map(y => y.id)))

		return () => db.off('chat', onChat)
	}, [chat.peer])

	let readLine = false
	return (
		<div style={{height: 0}} className="overflow-auto flex-grow-1 my-2">
			<Container className="d-flex flex-column gap-2">
				{chat.messages.map(x => {
					const elem = <ChatMessage
						key={x.id} msg={x} readLine={!x.read && !readLine}
						unsent={unsentMessages.includes(x.id)}/>
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

		const onMessage = ({peer}: MessageEvent) => {
			if (ctx.current.peer !== peer)
				return

			db.getChat(peer).then(setChat)
		}
		db.on('message', onMessage)

		db.getChat(ctx.current.peer).then(setChat)
		return () => db.off('message', onMessage)
	}, [ctx.current])

	const send = useCallback((text: string) => {
		if (!chat)
			return

		sendChatMessage(chat.peer, text)
			.catch(err => console.error(`failed sending message: ${err.message}`))
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