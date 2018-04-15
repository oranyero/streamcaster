import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Nav, Navbar, NavItem } from 'react-bootstrap';
import { LinkContainer } from 'react-router-bootstrap';
import Routes from './routes';
import './App.css';

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      authenticated: false,
    };
  }

  authenticate = auth => {
    this.setState({ authenticated: auth });
  }

  checkAuthenticated() {
    fetch('https://streamcaster.me/api/check_authenticated', {
      credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(responseJson => {
      if (responseJson.response === 'Authenticated') {
        this.authenticate(true);
      } else {
        this.authenticate(false);
      }
    })
    .catch((error) => {
      console.error(error);
    });
  }

  componentDidMount() {
    this.checkAuthenticated();
  }

  render() {
    const childProps = {
      authenticated: this.state.authenticated,
      authenticate: this.authenticate
    };
    return (
      <div className="App">
        <Navbar fluid inverse collapseOnSelect>
          <Navbar.Header>
            <Navbar.Brand>
              <Link to="/">Streamcaster</Link>
            </Navbar.Brand>
            <Navbar.Toggle />
          </Navbar.Header>
          <Navbar.Collapse>
            <Nav pullRight>
              {this.state.authenticated
                ? <Fragment>
                    <LinkContainer to="/account">
                      <NavItem>Account</NavItem>
                    </LinkContainer>
                  </Fragment>
                : <Fragment>
                    <LinkContainer to="/login">
                      <NavItem>Log In</NavItem>
                    </LinkContainer>
                    <LinkContainer to="/register">
                      <NavItem>Register</NavItem>
                    </LinkContainer>
                  </Fragment>
              }
            </Nav>
          </Navbar.Collapse>
        </Navbar>
        <Routes childProps={childProps} />
      </div>
    );
  }
}

export default App;
