package oauth2

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/Kumar-River/chronograf"
	"golang.org/x/oauth2"
)

var _ Provider = &Generic{}

// Generic provides OAuth Login and Callback server and is modeled
// after the Github OAuth2 provider. Callback will set an authentication
// cookie.  This cookie's value is a JWT containing the user's primary
// email address.
type Generic struct {
	PageName       string // Name displayed on the login page
	ClientID       string
	ClientSecret   string
	RequiredScopes []string
	Domains        []string // Optional email domain checking
	RedirectURL    string
	AuthURL        string
	TokenURL       string
	APIURL         string // APIURL returns OpenID Userinfo
	Logger         chronograf.Logger
}

// Name is the name of the provider
func (g *Generic) Name() string {
	if g.PageName == "" {
		return "generic"
	}
	return g.PageName
}

// ID returns the generic application client id
func (g *Generic) ID() string {
	return g.ClientID
}

// Secret returns the generic application client secret
func (g *Generic) Secret() string {
	return g.ClientSecret
}

// Scopes for generic provider required of the client.
func (g *Generic) Scopes() []string {
	return g.RequiredScopes
}

// Config is the Generic OAuth2 exchange information and endpoints
func (g *Generic) Config() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     g.ID(),
		ClientSecret: g.Secret(),
		Scopes:       g.Scopes(),
		RedirectURL:  g.RedirectURL,
		Endpoint: oauth2.Endpoint{
			AuthURL:  g.AuthURL,
			TokenURL: g.TokenURL,
		},
	}
}

// PrincipalID returns the email address of the user.
func (g *Generic) PrincipalID(provider *http.Client) (string, error) {
	res := struct {
		Email string `json:"email"`
	}{}

	r, err := provider.Get(g.APIURL)
	if err != nil {
		return "", err
	}

	defer r.Body.Close()
	if err = json.NewDecoder(r.Body).Decode(&res); err != nil {
		return "", err
	}

	email := res.Email

	// If we did not receive an email address, try to lookup the email
	// in a similar way as github
	if email == "" {
		email, err = g.getPrimaryEmail(provider)
		if err != nil {
			return "", err
		}
	}

	// If we need to restrict to a set of domains, we first get the org
	// and filter.
	if len(g.Domains) > 0 {
		// If not in the domain deny permission
		if ok := ofDomain(g.Domains, email); !ok {
			msg := "Not a member of required domain"
			g.Logger.Error(msg)
			return "", fmt.Errorf(msg)
		}
	}

	return email, nil
}

// UserEmail represents user's email address
type UserEmail struct {
	Email    *string `json:"email,omitempty"`
	Primary  *bool   `json:"primary,omitempty"`
	Verified *bool   `json:"verified,omitempty"`
}

// getPrimaryEmail gets the private email account for the authenticated user.
func (g *Generic) getPrimaryEmail(client *http.Client) (string, error) {
	emailsEndpoint := g.APIURL + "/emails"
	r, err := client.Get(emailsEndpoint)
	if err != nil {
		return "", err
	}
	defer r.Body.Close()

	emails := []*UserEmail{}
	if err = json.NewDecoder(r.Body).Decode(&emails); err != nil {
		return "", err
	}

	email, err := g.primaryEmail(emails)
	if err != nil {
		g.Logger.Error("Unable to retrieve primary email ", err.Error())
		return "", err
	}
	return email, nil
}

func (g *Generic) primaryEmail(emails []*UserEmail) (string, error) {
	for _, m := range emails {
		if m != nil && m.Primary != nil && m.Verified != nil && m.Email != nil {
			return *m.Email, nil
		}
	}
	return "", errors.New("No primary email address")
}

// ofDomain makes sure that the email is in one of the required domains
func ofDomain(requiredDomains []string, email string) bool {
	for _, domain := range requiredDomains {
		emailDomain := fmt.Sprintf("@%s", domain)
		if strings.HasSuffix(email, emailDomain) {
			return true
		}
	}
	return false
}
