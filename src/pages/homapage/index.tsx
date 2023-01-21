import * as React from 'react'
import {Col, Row} from 'react-bootstrap'
import ChatList from '../../componenets/ChatList'
import ChatView from '../../componenets/ChatView'
import {HomepageContext} from './context'
import {FunctionComponent, useState} from 'react'
import {ChatItem} from '../../types'

const Homepage: FunctionComponent = () => {
	const [current, setCurrent] = useState<ChatItem>()

	return (
		<HomepageContext.Provider value={{
			current: current,
			setCurrent: (chat) => setCurrent(chat),
		}}>
			<Row className="h-100">
				<Col xs={2}>
					<ChatList/>
				</Col>
				<Col xs={10}>
					<ChatView/>
				</Col>
			</Row>
		</HomepageContext.Provider>
	)
}

export default Homepage