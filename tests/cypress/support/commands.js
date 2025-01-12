import constants from './constants';
import selectors from './selectors';
import 'cypress-wait-until';

Cypress.Commands.add('waitForRequests', () =>
  cy.get(selectors.loader, { timeout: 20000 }).should('not.exist'),
);

Cypress.Commands.add('waitForLogoutButton', () =>
  cy
    .get(selectors.logOut, { timeout: 10000 })
    .should('be.visible')
    .should('not.be.disabled'),
);

// Contains a list of custom Commands
Cypress.Commands.add('login', (countryEmail) => {
  const apiUrl = Cypress.env(constants.envApiUrl);

  const email = countryEmail
    ? countryEmail
    : Cypress.env(constants.envLoginUser);

  cy.request('POST', apiUrl + constants.loginApiUrl, {
    email,
    password: Cypress.env(constants.envLoginPassword),
  })
    .as('post')
    .then((resp) => {
      window.localStorage.setItem(constants.loginToken, resp.body.user.token);
    });

  cy.visit(constants.dashboardPagePath);
  cy.waitForRequests(); // https://github.com/NoriSte/cypress-wait-until/issues/75#issuecomment-572685623
});
/* close all popup windows */
Cypress.Commands.add('closeAllTabs', () => {
  if (!myTabs.length) {
    return;
  }
  myTabs.forEach((v, k) => {
    if (k > 0) {
      try {
        myTabs[k].close();
      } catch (e) {
        console.error(e);
      }
      myTabs[k] = null;
    }
  });
  myTabNames.splice(1);
  myTabs.splice(1); // keep first one only
  // return to state 0 (main / root / original window)
  active_tab_index = 0;
  cy.state('document', myTabs[0].document);
  cy.state('window', myTabs[0]);
});
// Function that waits fo all promises to resolve
Cypress.Commands.add('waitForAngular', () => {
  return cy
    .window()
    .then({ timeout: constants.waitForAngularTimeout }, (win) => {
      return new Cypress.Promise((resolve, reject) => {
        let testabilities = win['getAllAngularTestabilities']();
        if (!testabilities) {
          return reject(new Error('No testabilities. Check Angular API'));
        }
        let count = testabilities.length;
        testabilities.forEach((testability) =>
          testability.whenStable(() => {
            count--;
            if (count !== 0) return;
            resolve();
          }),
        );
      });
    });
});

/* check trigger*/
Cypress.Commands.add('isStatusTriggered', () => {
  return cy.get(selectors.disasterType.selected).then((button) => {
    return button.hasClass('triggered');
  });
});

// Cypress.Commands.overwrite('log', (subject, message) =>
//   cy.task('log', message),
// );
