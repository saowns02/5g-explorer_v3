// CI/CD for the 5G Globe Explorer (Task 1: one open-source CI/CD tool).
// Runs on the host machine's Jenkins. Every push to main runs these stages
// in order; any failure stops the run before anything is deployed.
//
// One-off setup on the host (see deploy/openstack/README.md):
//   - Jenkins credentials:  fiveg-openrc (secret file, openrc for 5g-prod)
//                           fiveg-test-db-url (secret text, a PostGIS test database URL)
//   - Ops folder readable by the jenkins user: /opt/5g-explorer-ops
//     (inventory, SSH key and DB password written by provision.sh)

// True for main in both a plain Pipeline job (GIT_BRANCH=origin/main)
// and a Multibranch job (BRANCH_NAME=main).
def onMain() { return env.BRANCH_NAME == 'main' || env.GIT_BRANCH == 'origin/main' }

pipeline {
  agent any

  triggers {
    // The host sits behind a home or university router, so GitHub can't
    // call a webhook; Jenkins checks for new commits every two minutes.
    pollSCM('H/2 * * * *')
  }

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  parameters {
    booleanParam(name: 'RELOAD_DATA', defaultValue: false, description: 'Rebuild the OpenStack database from the CSV even if db/ and data/ did not change')
    booleanParam(name: 'DEPLOY_NATIVE', defaultValue: false, description: 'Also deploy this commit to the native baseline on the host')
  }

  environment {
    SECRETS_DIR = '/opt/5g-explorer-ops'
    INVENTORY   = '/opt/5g-explorer-ops/inventory.env'
    SSH_KEY     = '/opt/5g-explorer-ops/5g-explorer'
    VENV        = "${WORKSPACE}/.ci-venv"
    EXPECTED_ROWS = '144449'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git log -1 --format="Commit %h by %an: %s"'
      }
    }

    stage('Lint and unit test') {
      parallel {
        stage('API') {
          steps {
            withCredentials([string(credentialsId: 'fiveg-test-db-url', variable: 'TEST_DATABASE_URL')]) {
              sh '''
                python3 -m venv "$VENV"
                "$VENV/bin/pip" install -q -r api/requirements-dev.txt
                "$VENV/bin/ruff" check api db
                cd api && "$VENV/bin/pytest" -q --junitxml=../reports/api.xml
              '''
            }
          }
        }
        stage('Frontend') {
          steps {
            dir('frontend') {
              sh 'npm ci --no-audit --no-fund'
              sh 'npx vitest run --reporter=junit --outputFile=../reports/frontend.xml'
            }
          }
        }
      }
    }

    stage('Validate data') {
      steps {
        // No duplicates, operators in the agreed list, coordinates in range,
        // row count as expected (db/tests/test_data.py).
        sh '"$VENV/bin/pytest" -q db/tests --junitxml=reports/data.xml'
      }
    }

    stage('Build') {
      steps {
        dir('frontend') {
          sh 'VITE_API_URL=/api npm run build'
        }
        sh 'git archive --format=tar.gz -o api-$(git rev-parse --short HEAD).tar.gz HEAD api db data/5g_coverage_clean.csv'
        archiveArtifacts artifacts: 'api-*.tar.gz', fingerprint: true
      }
    }

    stage('Deploy to OpenStack') {
      when { expression { onMain() } }
      steps {
        withCredentials([file(credentialsId: 'fiveg-openrc', variable: 'OPENRC')]) {
          sh '''
            set +x
            . "$OPENRC"
            set -x
            MODE=""
            # Reload the database only when the schema, loader or data changed.
            if [ "$RELOAD_DATA" = "true" ]; then
              MODE="--reload-data"
            elif [ -n "${GIT_PREVIOUS_SUCCESSFUL_COMMIT:-}" ] && \
                 ! git diff --quiet "$GIT_PREVIOUS_SUCCESSFUL_COMMIT" HEAD -- db data; then
              MODE="--reload-data"
            fi
            ./deploy/openstack/deploy.sh $MODE
          '''
        }
      }
    }

    stage('Smoke test') {
      when { expression { onMain() } }
      steps {
        sh '''
          . "$INVENTORY"
          curl -fsS "http://$WEB_FIP/api/health"
          curl -fsS -o /dev/null "http://$WEB_FIP/"
          ROWS=$(curl -fsS "http://$WEB_FIP/api/meta" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totals"]["records"])')
          echo "Live records: $ROWS"
          test "$ROWS" -gt 0
          echo "Smoke test passed for http://$WEB_FIP"
        '''
      }
    }

    stage('Deploy to native baseline') {
      when { expression { onMain() && params.DEPLOY_NATIVE } }
      steps {
        // Needs a sudoers rule letting the jenkins user run this one script.
        sh 'sudo SKIP_FRONTEND_BUILD=1 ./deploy/native/setup.sh'
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'reports/*.xml'
    }
    success {
      echo "Deployed ${env.GIT_COMMIT?.take(7)}"
    }
    failure {
      echo 'Pipeline failed; nothing after the failed stage was deployed.'
    }
  }
}
