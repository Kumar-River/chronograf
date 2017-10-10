package oauth2

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"net/http"

	"github.com/google/go-github/github"
	"github.com/Kumar-River/chronograf"
	"golang.org/x/oauth2"
	ogh "golang.org/x/oauth2/github"
)

var _ Provider = &Github{}

// Github provides OAuth Login and Callback server. Callback will set
// an authentication cookie.  This cookie's value is a JWT containing
// the user's primary Github email address.
type Github struct {
	ClientID     string
	ClientSecret string
	Orgs         []string // Optional github organization checking
	Logger       chronograf.Logger
}

// Name is the name of the provider
func (g *Github) Name() string {
	return "github"
}

// ID returns the github application client id
func (g *Github) ID() string {
	return g.ClientID
}

// Secret returns the github application client secret
func (g *Github) Secret() string {
	return g.ClientSecret
}

// Scopes for github is only the email addres and possible organizations if
// we are filtering by organizations.
func (g *Github) Scopes() []string {
	scopes := []string{"user:email"}
	if len(g.Orgs) > 0 {
		scopes = append(scopes, "read:org")
	}
	return scopes
}

// Config is the Github OAuth2 exchange information and endpoints
func (g *Github) Config() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     g.ID(),
		ClientSecret: g.Secret(),
		Scopes:       g.Scopes(),
		Endpoint:     ogh.Endpoint,
	}
}

// PrincipalID returns the github email address of the user.
func (g *Github) PrincipalID(provider *http.Client) (string, error) {
	client := github.NewClient(provider)
	// If we need to restrict to a set of organizations, we first get the org
	// and filter.
	if len(g.Orgs) > 0 {
		orgs, err := getOrganizations(client, g.Logger)
		if err != nil {
			return "", err
		}
		// Not a member, so, deny permission
		if ok := isMember(g.Orgs, orgs); !ok {
			g.Logger.Error("Not a member of required github organization")
			return "", err
		}
	}

	email, err := getPrimaryEmail(client, g.Logger)
	if err != nil {
		return "", nil
	}
	return email, nil
}

func randomString(length int) string {
	k := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, k); err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(k)
}

func logResponseError(log chronograf.Logger, resp *github.Response, err error) {
	switch resp.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		log.Error("OAuth access to email address forbidden ", err.Error())
	default:
		log.Error("Unable to retrieve Github email ", err.Error())
	}
}

// isMember makes sure that the user is in one of the required organizations
func isMember(requiredOrgs []string, userOrgs []*github.Organization) bool {
	for _, requiredOrg := range requiredOrgs {
		for _, userOrg := range userOrgs {
			if userOrg.Login != nil && *userOrg.Login == requiredOrg {
				return true
			}
		}
	}
	return false
}

// getOrganizations gets all organization for the currently authenticated user
func getOrganizations(client *github.Client, log chronograf.Logger) ([]*github.Organization, error) {
	// Get all pages of results
	var allOrgs []*github.Organization
	for {
		opt := &github.ListOptions{
			PerPage: 10,
		}
		// Get the organizations for the current authenticated user.
		orgs, resp, err := client.Organizations.List("", opt)
		if err != nil {
			logResponseError(log, resp, err)
			return nil, err
		}
		allOrgs = append(allOrgs, orgs...)
		if resp.NextPage == 0 {
			break
		}
		opt.Page = resp.NextPage
	}
	return allOrgs, nil
}

// getPrimaryEmail gets the primary email account for the authenticated user.
func getPrimaryEmail(client *github.Client, log chronograf.Logger) (string, error) {
	emails, resp, err := client.Users.ListEmails(nil)
	if err != nil {
		logResponseError(log, resp, err)
		return "", err
	}

	email, err := primaryEmail(emails)
	if err != nil {
		log.Error("Unable to retrieve primary Github email ", err.Error())
		return "", err
	}
	return email, nil
}

func primaryEmail(emails []*github.UserEmail) (string, error) {
	for _, m := range emails {
		if m != nil && m.Primary != nil && m.Verified != nil && m.Email != nil {
			return *m.Email, nil
		}
	}
	return "", errors.New("No primary email address")
}
