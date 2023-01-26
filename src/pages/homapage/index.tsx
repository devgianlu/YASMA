import * as React from 'react'
import {Col, Row} from 'react-bootstrap'
import ChatList from '../../components/ChatList'
import ChatView from '../../components/ChatView'
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
			<Row className="h-100 mx-0">
				<Col xs={4} lg={2} className="px-0 border-end">
					<ChatList/>
				</Col>
				<Col xs={8} lg={10} className="px-0">
					<ChatView/>
				</Col>
			</Row>
		</HomepageContext.Provider>
	)
}

export default Homepage